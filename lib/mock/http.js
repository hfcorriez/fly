const { fork } = require('child_process')
const path = require('path')
const debug = require('debug')('TEST:MOCK:HTTP')
const EventEmitter = require('events')

let http
let mock
const DEFAULT_FORK_OPTIONS = {
  cwd: process.cwd(),
  env: {
    NODE_ENV: 'test',
    DEBUG: 'TEST*'
  },
  uid: 0,
  gid: 0
}
const eventEmitter = new EventEmitter()
const MOCK_NOT_READY = 'mock not ready'
// const STATUS_OK_FROM_HTTP = 'mock status changed confirm by http'
const STATUS_OK_FROM_MOCK = 'mock status changed confirm by mock'
const START_OK_FROM_HTTP = 'http server reply start ok'
const STOP_OK_FROM_HTTP = 'http server reply stop ok'

exports.startFlyHttpServer = async function (forkOptions) {
  if (http) {
    return
  }
  forkOptions = Object.assign({}, DEFAULT_FORK_OPTIONS, forkOptions || {})
  // debug('http sever fork options', forkOptions)
  http = fork(path.join(__dirname, '../../bin/fly'), ['http'], forkOptions)
  // event from mock
  http.on('message', data => {
    // debug('message from http', data)
    debug('http --> test', data)
    if (data.type === 'MOCK') {
      if (data.name === '_startMocks') {
        return eventEmitter.emit(START_OK_FROM_HTTP, data)
      } else if (data.name === '_stopMocks') {
        return eventEmitter.emit(STOP_OK_FROM_HTTP, data)
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
    setTimeout(resolve, 3000)
  })
}

exports.itMock = function itMock (title, asyncFn) {
  const file = _getMockFile()
  global.it(title, async () => { // it of mocha
    await startMockServer(file)
    await asyncFn()
    await stopMockServer(file)
  })
}

async function startMockServer (file) {
  file = _getMockFile(file)
  debug('start mock with file:', file)
  mock = fork(path.join(__dirname, './mock-server.js'), [file], {})
  // event from client
  mock.on('message', data => {
    debug('mock --> test', data)
    if (data.type === 'MOCK') {
      // send to http
      if (data.name === '_status') {
        eventEmitter.emit(STATUS_OK_FROM_MOCK, data)
      } else if (data.name === '_startMocks') {
        http.send(data)
      } else {
        http.send(data)
      }
    }
  })
  return new Promise(resolve => {
    eventEmitter.once(START_OK_FROM_HTTP, resolve)
  })
}

exports.startMockServer = startMockServer

async function stopMockServer (file) {
  file = _getMockFile(file)
  debug('stop mock with file:', file)
  http.send({ type: 'MOCK', name: '_stopMocks', event: file })
  mock.send({ type: 'MOCK', name: '_status', event: 'MOCK_STOP' })
  return Promise.all([
    new Promise(resolve => {
      eventEmitter.once(STOP_OK_FROM_HTTP, resolve)
    }),
    new Promise(resolve => {
      eventEmitter.once(STATUS_OK_FROM_MOCK, resolve)
      mock.send({ type: 'MOCK', name: '_status', event: file })
    })
  ])
}
exports.stopMockServer = stopMockServer

exports.createMock = function (file) {
  const mocks = require(file)
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
  process.send({ type: 'MOCK', name: '_startMocks', event: mocks.file })
}

exports.startMocks = function startMocks (mockFile) {
  const mocks = (mockFile && require(mockFile)) || {}
  const flyFns = new Set(Object.keys(mocks.fly || {}))
  const libFiles = Object.keys(mocks.lib || {})
  const reloadFns = mocks.reload || []
  for (let _path of libFiles) {
    delete require.cache[require.resolve(_path)]
    const _module = require(_path)
    for (let _prop of Object.keys(mocks.lib[_path])) {
      _module[_prop] = mocks.lib[_path][_prop]
    }
  }
  return { flyFns, reloadFns, libFiles }
}

exports.stopMocks = function stopMocks (mockFile) {
  const mocks = (mockFile && require(mockFile)) || {}
  const libFiles = Object.keys(mocks.lib || {})
  for (let _path of libFiles) {
    delete require.cache[require.resolve(_path)]
    require(_path)
  }
  return { flyFns: new Set([]), reloadFns: mocks.reload, libFiles: [] }
}

function _getMockFile (file) {
  if (file) {
    return file
  }
  const testFile = _getCallerFile()
  if (!testFile) {
    throw new Error('bad param file')
  }
  return testFile.replace('.test.js', '.mock.js')
}
function _getCallerFile () {
  try {
    var err = new Error()
    var callerfile
    var currentFile

    Error.prepareStackTrace = function (e, stack) { return stack }

    currentFile = err.stack.shift().getFileName()

    // debug(err.stack.map(s => s.getFileName()))
    while (err.stack.length) {
      callerfile = err.stack.shift().getFileName()

      if (currentFile !== callerfile) return callerfile
    }
  } catch (err) {}
  return undefined
}
