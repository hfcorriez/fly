const fs = require('fs')
const mime = require('mime')
const pathToRegexp = require('path-to-regexp')
const { URL } = require('url')
const path = require('path')
const fastify = require('fastify')()
const Fly = require('../../lib/fly')
const debug = require('debug')('fly/srv/htt')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  config: {
    port: 5000,
    errors: {
      '404': fs.readFileSync(path.join(__dirname, './http/404.html')),
      '500': fs.readFileSync(path.join(__dirname, './http/500.html'))
    }
  },

  before: async function (event) {
    this.fly = new Fly()
    this.functions = this.fly.list('http')

    await this.fly.broadcast('startup')

    // process.on('uncaughtException', (err) => {
    //   console.error('uncaughtException', err)
    // })

    let stop = false
    EXIT_SIGNALS.forEach(status => process.on(status, async () => {
      if (stop) return
      try {
        stop = true
        debug('shutdown...')
        await this.fly.broadcast('shutdown')
        process.exit(0)
      } catch (err) {
        console.error(`shutdown with error: ${err.message} `)
        process.exit(1)
      }
    }))

    return event
  },

  main: async function (event, ctx) {
    fastify.route({
      method: ['GET', 'POST', 'HEAD', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
      url: '/*',
      handler: async (req, res) => {
        const urlObj = new URL('http://' + req.headers.host + req.raw.url)

        let evt = {
          method: req.raw.method.toLowerCase(),
          path: urlObj.pathname,
          origin: urlObj.origin,
          host: urlObj.host,
          domain: urlObj.hostname,
          url: urlObj.href,
          protocol: urlObj.protocol,
          port: urlObj.port,
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.raw.socket.remoteAddress,
          headers: req.headers || {},
          body: req.body || {},
          query: req.query || {},
          search: urlObj.search,
          cookies: {}
        }

        if (evt.headers.cookie) {
          evt.headers.cookie.split(';').forEach(function (item) {
            const crumbs = item.split('=')
            if (crumbs.length > 1) evt.cookies[crumbs[0].trim()] = crumbs[1].trim()
          })
        }

        let result
        let eventId = req.headers['x-fly-id'] || null

        try {
          let matched
          let fn = this.functions.find(f => {
            matched = this.match(evt, f.events.http)
            return !!matched
          })

          if (fn) {
            result = await this.fly.call(fn, Object.assign(evt, matched), { eventId, eventType: 'http' })
          }
        } catch (err) {
          res.code(502).type('application/json').send({
            code: err.code || 10,
            message: err.message
          })
          debug(`backend failed: ${err.message}`, err.stack)
          return
        }

        if (!result) {
          if (this.config.errors['404']) {
            res.code(404).type('text/html').send(this.config.errors['404'])
          } else {
            res.code(404).type('application/json').send({
              code: 404,
              message: `function not found`
            })
          }
          return
        }

        if (result.file) {
          res.type(mime.getType(result.file)).send(fs.createReadStream(result.file))
          return
        }

        if (result.headers) {
          Object.keys(result.headers).forEach(key => {
            res.header(key, result.headers[key])
          })
        }

        if (result.redirect) {
          res.redirect(result.status || 302, result.redirect)
          return
        }

        // only headers no body
        if (result.headers && !result.body) {
          res.send('')
          return
        }

        if (result.status) {
          res.code(result.status)
        }

        if (result.type) {
          res.type(result.type)
        }

        /**
         * headers: {
         *    "x-powered-by": "fly"
         * }
         */

        // send body
        if (result.hasOwnProperty('body')) {
          if (!result.type && typeof result.body === 'string') res.type('text/html')
          res.send(result.body)
          return
        }

        // no body and other options response 500
        if (this.config.errors['500']) {
          res.code(500).type('text/html').send(this.config.errors['500'])
        } else {
          res.code(500).type('application/json').send({
            code: 500,
            message: 'no body return'
          })
        }
      }
    })

    return new Promise((resolve, reject) => {
      const port = event && event.port || this.config.port
      fastify.listen(port, (err, address) => {
        if (err) return reject(err)

        resolve({
          address,
          routes: this.buildRoutes()
        })
      })
    })
  },

  buildRoutes: function () {
    return this.functions.map(fn => {
      let e = fn.events.http
      return { method: e.method || 'get', path: e.path, domain: e.domain, fn: fn.id }
    })
  },

  match: (source, target) => {
    if (!target.path && target.default) target.path = target.default
    if (!target.method) target.method = 'get'
    if (!target.path) return false
    if (source.method !== target.method && target.method !== '*') return false
    if (target.domain) {
      if (typeof target.domain === 'string') target.domain = [target.domain]
      let domainValid = target.domain.some(domain => {
        return new RegExp('^' + domain.replace(/\./g, '\\.').replace(/\*/g, '.*?') + '$').test(source.domain)
      })
      if (!domainValid) return false
    }

    if (target.path[0] !== '/') {
      console.warn('warn: http path is not start with "/", recommend to add it')
      target.path = '/' + target.path
    }

    let keys = []
    let regex = pathToRegexp(target.path, keys)
    let matched = regex.exec(source.path)

    if (!matched) return false

    let params = {}
    keys.forEach((key, i) => {
      params[key.name] = matched[i + 1]
    })

    return { params: params }
  }
}
