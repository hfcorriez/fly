const debug = require('debug')('qi/cli/htt')
const req = require('req-fast')
const http = require('http')
const tcpp = require('tcp-ping')

const Errors = require('./errors')

http.globalAgent.keepAlive = true

class Http {
  constructor(options) {
    this.options = options
    this.url = `http://${this.options.host}:${this.options.port}`
  }

  async call (fn, event, ctx, retry) {
    ctx = ctx || {}
    retry = retry || 3

    let data

    try {
      let headers = {}

      if (ctx.id) {
        headers['X-QI-ID'] = ctx.id
      }

      if (ctx.async === true) {
        headers['X-QI-Async'] = '1'
      }

      if (ctx.eventType) {
        headers['X-QI-EventType'] = ctx.eventType
      }

      data = await (new Promise((resolve, reject) => {
        req({
          method: 'post',
          uri: `${this.url}/${fn}`,
          data: event || {},
          headers: headers,
          timeout: 10000
        }, function (err, res) {
          if (err) return reject(new Errors.HttpError(err.message, res.statusCode))

          // 如果返回的 code 不为 0
          if (res.body.code !== 0) {
            const err = new Error(res.body.message)
            err.code = res.body.code
            err.type = 'RpcError'
            return reject(err)
          }

          resolve(res.body.data || null)
        })
      }))

      debug(`${fn} ${this.url} ${ctx.id || ''} ${ctx.async ? '[async]' : ''}`)
      return data
    } catch (err) {
      debug(`${fn} ${this.url} ${err.code} ${err.message} ${ctx.id || ''} ${ctx.async ? '[async]' : ''}`)
      if (retry > 0 && err instanceof Errors.HttpError && [500, 502, 503].includes(err.code)) {
        debug(`retry ${fn} ${this.url}`)
        return this.call(fn, event, ctx, --retry)
      }
      throw err
    }
  }

  async ping () {
    let startTime = Date.now()
    let success = await new Promise((resolve, reject) => {
      tcpp.probe(this.options.host, parseInt(this.options.port), (err, available) => {
        if (err) return resolve(false)
        resolve(available)
      })
    })

    debug(`ping ${this.url} ${success ? 'success' : 'failed'}`)

    return {
      success,
      duration: Date.now() - startTime
    }
  }
}

module.exports = Http
