const { fork } = require('child_process')
const path = require('path')

let http
let mock
const DEFAULT_FORK_OPTIONS = {
  env: process.cwd()
}
exports.startFlyHttpServer = function (forkOptions = DEFAULT_FORK_OPTIONS) {
  http = fork(path.join(__dirname, '../bin/fly'), ['http', '-r'], forkOptions)
  // event from mock
  http.on('message', (event) => {
    // send to mock
    mock.send(event)
  })
}
exports.startClient = function (modulePath, forkOptions = DEFAULT_FORK_OPTIONS) {
  mock = fork(modulePath, [], forkOptions)
  // event from client
  mock.on('message', event => {
    // send to http
    http.send(event)
  })
}

exports.createMock = function (mocks) {
  //   handle event from http
  process.on('message', data => {
    if (typeof mocks[data.name] === 'function') {
      mocks[data.name](data.event).then(event => process.send({
        name: data.name,
        event
      }))
    } else if (typeof mocks[data.name] !== 'undefined') {
      process.send({
        name: data.name,
        event: mocks[data.name]
      })
    } else {
      process.send({
        name: '404',
        data: null
      })
    }
  })
}
