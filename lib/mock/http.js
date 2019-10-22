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
  http = fork(path.join(__dirname, '../../bin/fly'), ['http'], forkOptions)
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

exports.startMockServer = async function (file) {
  debug('start mock server, file: ', file)
  mock = fork(path.join(__dirname, './mock-server.js'), [file], {})
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
  http.send({ type: 'MOCK', name: '_setMocks', event: '' })
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

exports.createMock = function (file) {
  debug('create mock, file: ', file)
  const mocks = require(file)
  debug('mocks', mocks)
  if (!mocks.fly) {
    mocks.fly = {}
  }
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
  process.send({ type: 'MOCK', name: '_setMocks', event: mocks.file })
}

exports.setMocks = function setMocks (mockFile, libFilesToRemove) {
  debug('set mocks, ', { mockFile, libFilesToRemove })
  const mocks = (mockFile && require(mockFile)) || {}
  debug('set mocks, mocks: ', mocks)
  const flyFns = new Set(Object.keys(mocks.fly || {}))
  const libFiles = Object.keys(mocks.lib || {})
  const reloads = mocks.reload || []
  if (libFilesToRemove) { // remove lib mocks
    libFilesToRemove.forEach((_path) => {
      debug('remove mocked lib: ', require.resolve(_path))
      delete require.cache[require.resolve(_path)]
      require(_path)
    })
  } else { // add lib mocks
    libFiles.forEach((_path) => {
      debug('add mocked lib: ', require.resolve(_path))
      delete require.cache[require.resolve(_path)]
      debug('after delete require cache', Object.keys(require.cache).filter(p => p.includes('http/server')))
      const _module = require(_path)
      debug('after add require cache', Object.keys(require.cache).filter(p => p.includes('http/server')))
      debug('new module', Object.keys(_module))
      for (let _prop of Object.keys(mocks.lib[_path])) {
        debug(_module, _prop, mocks.lib[_path][_prop])
        _module[_prop] = mocks.lib[_path][_prop]
      }
    })
  }

  return { flyFns, libFiles, reloads }
}
