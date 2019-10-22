const { fork } = require('child_process')
const path = require('path')
const debug = require('debug')('TEST:MOCK:HTTP')
const EventEmitter = require('events')

let http
let mock
const DEFAULT_FORK_OPTIONS = {
  cwd: process.cwd(),
  env: {
    NODE_ENV: 'test'
  },
  uid: 501,
  gid: 20
}
const eventEmitter = new EventEmitter()
const MOCK_NOT_READY = 'mock not ready'
// const STATUS_OK_FROM_HTTP = 'mock status changed confirm by http'
const STATUS_OK_FROM_MOCK = 'mock status changed confirm by mock'
const SET_MOCKS_DONE = 'http server set mocks done'

exports.startFlyHttpServer = async function (forkOptions = DEFAULT_FORK_OPTIONS) {
  http = fork(path.join(__dirname, '../bin/fly'), ['http'], forkOptions)
  // event from mock
  http.on('message', data => {
    // debug('message from http', data)
    debug('message from http', data)
    if (data.type === 'MOCK') {
      if (data.name === '_setMocks') {
        return eventEmitter.emit(SET_MOCKS_DONE, data)
      }
      // send to mock
      if (mock) {
        return mock.send(data)
      } else {
        return eventEmitter.emit(MOCK_NOT_READY, data)
      }
    }
  })
  return new Promise(resolve => {
    setTimeout(resolve, 2000)
  })
}

exports.startMockServer = async function (modulePath, forkOptions = DEFAULT_FORK_OPTIONS) {
  mock = fork(modulePath, [], forkOptions)
  // event from client
  mock.on('message', data => {
    debug('message from mock', data)
    if (data.type === 'MOCK') {
      // send to http
      if (data.name === '_status') {
        eventEmitter.emit(STATUS_OK_FROM_MOCK, data)
      } else if (data.name === '_setMocks') {
        http.send(data)
      } else {
        http.send(data)
      }
    }
  })
  return new Promise(resolve => {
    eventEmitter.once(SET_MOCKS_DONE, resolve)
  })
}

exports.stopMockServer = async function () {
  http.send({ type: 'MOCK', name: '_setMocks', event: [] })
  mock.send({ type: 'MOCK', name: '_status', event: 'MOCK_STOP' })
  return Promise.all([
    new Promise(resolve => {
      eventEmitter.once(SET_MOCKS_DONE, resolve)
    }),
    new Promise(resolve => {
      eventEmitter.once(STATUS_OK_FROM_MOCK, resolve)
      mock.send({ type: 'MOCK', name: '_status', event: 'MOCK_STOP' })
    })
  ])
}

exports.createMock = function (mocks) {
  //   mock process, handle event from http
  process.on('message', data => {
    debug('mock receive message', data)
    if (data.type === 'MOCK') {
      if (data.name === '_status') {
        process.send({ type: 'MOCK', name: '_status', event: 'OK' })
        if (data.event === 'MOCK_STOP') {
          process.exit(0)
        }
        return
      }
      if (typeof mocks[data.name] === 'function') {
        mocks[data.name](data.event).then(event => process.send({
          type: 'MOCK',
          name: data.name,
          event
        })).catch(err => process.send({
          type: 'MOCK',
          name: data.name,
          error: err.message
        }))
      } else if (typeof mocks[data.name] !== 'undefined') {
        process.send({
          type: 'MOCK',
          name: data.name,
          event: mocks[data.name]
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
  process.send({ type: 'MOCK', name: '_setMocks', event: Object.keys(mocks) })
}
