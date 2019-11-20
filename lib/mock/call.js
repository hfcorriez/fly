const { fork } = require('child_process')
const path = require('path')
const debug = require('debug')('TEST:MOCK:CALL')

const DEFAULT_FORK_OPTIONS = {
  cwd: process.cwd(),
  env: {
    NODE_ENV: 'test',
    DEBUG: '*'
  }
}
exports.defaultForkOptions = DEFAULT_FORK_OPTIONS

exports.flyCall = async function flyCall ({ modulePath, mockPath, event }, forkOptions) {
  event = event || {}
  debug(DEFAULT_FORK_OPTIONS)
  forkOptions = Object.assign({}, DEFAULT_FORK_OPTIONS, forkOptions || {})
  const mock = fork(path.join(__dirname, 'call-fly.js'), [modulePath, mockPath, JSON.stringify(event)], forkOptions)
  return new Promise((resolve, reject) => {
    mock.on('message', data => {
      debug('receive data from mock: ', data)
      if (!data) {
        reject(new Error(`invalid event`))
      }
      if (data.type === 'MOCK') {
        if (data.error) {
          reject(data.error)
        } else {
          resolve(data.event)
        }
      }
    })
  })
}
