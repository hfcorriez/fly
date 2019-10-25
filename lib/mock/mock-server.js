const debug = require('debug')('TEST:MOCK:SERVER')
const rewire = require('rewire')

debug(process.argv)
module.exports = createMock(process.argv[2], process.argv[3])

function createMock (file, rewiredObjJSON) {
  let rewiredObj = JSON.parse(rewiredObjJSON)
  const mocks = rewire(file)
  // debug('mocks', mocks)
  if (!mocks.fly) {
    mocks.fly = {}
  }
  //   mock process, handle event from http
  process.on('message', data => {
    debug('test --> mock:', data)
    if (data.type === 'MOCK') {
      if (data.name === '_status') {
        process.send({ type: 'MOCK', name: '_status', event: 'OK' })
        if (data.event === 'MOCK_STOP') {
          process.exit(0)
        }
        return
      } else if (data.name === '_rewire') {
        const { rewiredObj } = data.event

        for (let _prop of Object.keys(rewiredObj)) {
          mocks.__set__(_prop, rewiredObj[_prop]) // 更改mock fly的私有变量
        }
        process.send({ type: 'MOCK', name: '_rewire', event: 'OK' })
      }
      if (typeof mocks.fly[data.name] === 'function') {
        mocks.fly[data.name](data.event).then(event => process.send({
          type: 'MOCK',
          name: data.name,
          event
        })).catch(err => process.send({
          type: 'MOCK',
          name: data.name,
          error: err.message
        }))
      } else if (typeof mocks.fly[data.name] !== 'undefined') {
        process.send({
          type: 'MOCK',
          name: data.name,
          event: mocks.fly[data.name]
        })
      } else {
        process.send({
          type: 'MOCK',
          name: '404',
          data: null
        })
      }
    }
  })
  process.send({ type: 'MOCK',
    name: '_startMocks',
    event: {
      file: mocks.file,
      rewiredObj
    }
  })
}
