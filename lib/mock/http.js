const { fork } = require('child_process')
const EventEmitter = require('events')
const path = require('path')
const debug = require('debug')('TEST:MOCK:HTTP')

const CONTROL_FNS = [
  '_startMock', // 从指定文件加载 mock，默认是 *.test.js 对应文件夹内的 *.mock.js
  '_stopMock', // 清除 mock http
  '_exitMock', //  中止 mock http 进程
  '_rewireMock' // 更新 *.mock.js 中的私有变量值
]

class MockHttpServer {
  constructor (options) {
    this.options = {
      cwd: process.cwd(),
      ...options,
      env: {
        NODE_ENV: 'test',
        DEBUG: 'TEST*',
        ...options.env
      }
    }
    this.hasStarted = false
    this.events = new EventEmitter()
    this.http = fork(path.join(__dirname, '../../bin/fly'), ['http'], this.options)
    this.http.on('message', data => {
      if (data.type === 'mock' && CONTROL_FNS.includes(data.fn)) {
        this.events.emit(data.fn, data)
      } else {
        console.error('unexpected message from mock server: ', data)
      }
    })
  }
  async start (file) {
    if (!this.hasStarted) {
      await new Promise(resolve => {
        setTimeout(resolve, 5000)
      })
      this.hasStarted = true
    }
    file = this._getMockFile(file)
    debug(`start with ${file}`)
    this.http.send({ type: 'mock', fn: '_startMock', event: { file } })
  }
  async stop (file) {
    file = this._getMockFile(file)
    debug(`stop with ${file}`)
    return new Promise(resolve => {
      this.events.once('_stopMock', resolve)
      this.http && this.http.send({ type: 'mock', fn: '_stopMock', event: { file } })
    })
  }
  exit () {
    this.http && this.http.send({ type: 'mock', fn: '_exitMock', event: 0 })
  }
  async rewire (rewiredObj) {
    return new Promise(resolve => {
      this.events.once('_rewireMock', resolve)
      this.http.send({ type: 'mock', fn: '_rewireMock', event: { rewiredObj } })
    })
  }
  _getMockFile (file) {
    debug('fly http file', { file })
    if (file) {
      return file
    }
    const testFile = this._getCallerFile()
    if (!testFile) {
      throw new Error('bad param file')
    }
    debug({ testFile })
    return testFile.replace('.test.js', '.mock.js')
  }
  _getCallerFile () {
    try {
      var err = new Error()
      var callerfile
      var currentFile

      Error.prepareStackTrace = function (e, stack) { return stack }
      currentFile = err.stack.shift().getFileName()

      while (err.stack.length) {
        callerfile = err.stack.shift().getFileName()
        if (currentFile !== callerfile) return callerfile
      }
    } catch (err) {}
    return undefined
  }
}

module.exports = MockHttpServer
