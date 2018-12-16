const debug = require('debug')('fly/cli/htt')
const req = require('req-fast')
const http = require('http')

http.globalAgent.keepAlive = true

const defualOptions = {
  timeout: 10000
}

class Client {
  constructor(options) {
    if (typeof options === 'string') {
      options = {url: options}
    }
    this.options = Object.assign({}, defualOptions, options)
  }

  async call (fn, event, ctx, retry) {
    ctx = ctx || {}
    retry = retry || 3

    let data

    try {
      let headers = {}

      if (ctx.id) {
        headers['X-FLY-ID'] = ctx.id
      }

      if (ctx.async === true) {
        headers['X-FLY-Async'] = '1'
      }

      if (ctx.eventType) {
        headers['X-FLY-EventType'] = ctx.eventType
      }

      data = await (new Promise((resolve, reject) => {
        req({
          method: 'post',
          uri: `${this.url}/${fn}`,
          data: event || {},
          headers,
          timeout: this.options.timeout
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
}

module.exports = Client
