const Fly = require('../fly')
const debug = require('debug')('TEST:CALL:FLY')

debug('argv', process.argv)
const [ , , flyFnPath, mockFilePath, json ] = process.argv

const mocks = require(mockFilePath) // module-alias ready

class MockFly extends Fly {
  async call (name, event, initialContext) {
    if (!name) throw Fly.Error('no name to call')
    const fnName = name.name || name
    if (mocks.fly[fnName]) { // fly mock
      if (typeof mocks.fly[fnName] === 'function') {
        return mocks.fly[fnName](event)
      } else {
        return mocks.fly[fnName]
      }
    } else {
      return super.call(name, event, initialContext)
    }
  }
}
const fly = new MockFly()
const event = JSON.parse(json)

const name = require.resolve(flyFnPath)
try {
  _rewireLibs() // lib mock ready
  fly.load(name)
  const fn = fly.get(name)
  fly.call(fn, event, {})
    .then(result => {
      _sendEvent({ event: result })
    })
    .catch(err => {
      _sendEvent({ error: { message: err.message, stack: err.stack } })
    })
} catch (err) {
  _sendEvent({ error: { message: err.message, stack: err.stack } })
}

function _sendEvent ({ event, error }) {
  process.send({ type: 'MOCK', name: 'call', event, error })
}

function _rewireLibs () {
  for (let libPath of Object.keys(mocks.lib)) {
    const _module = require(libPath)
    for (let _prop of Object.keys(mocks.lib[libPath])) {
      _module[_prop] = mocks.lib[libPath][_prop]
    }
  }
}
