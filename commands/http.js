const Table = require('cli-table2')
const fs = require('fs')
const mime = require('mime')
const pathToRegexp = require('path-to-regexp')
const { URL } = require('url')
const path = require('path')
const fastify = require('fastify')()
const debug = require('debug')('fly/evt/htt')

module.exports = Object.assign({}, require('../lib/server'), {
  config: {
    command: 'http',
    name: 'HTTP',
    port: parseInt(process.env.PORT || 5000, 10),
    address: '127.0.0.1',
    errors: {
      '404': fs.readFileSync(path.join(__dirname, './http/404.html')),
      '500': fs.readFileSync(path.join(__dirname, './http/500.html'))
    }
  },

  run (event) {
    const functions = this.fly.list('http').sort((a, b) => (b.events.http.priority || 0) - (a.events.http.priority || 0))

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
        let headers = {}

        try {
          let { fn, matched, mode } = this.Find(functions, evt)

          // Match function but target has cors
          if (matched.target.cors ||
            // Match prefligth
            mode === 'cors') {
            headers['access-control-allow-origin'] = '*'
            headers['access-control-allow-methods'] = req.headers['access-control-request-method'] || 'GET,HEAD,PUT,PATCH,POST,DELETE'
            headers['access-control-allow-credentials'] = 'true'
            headers['access-control-allow-headers'] = req.headers['access-control-request-headers'] || '*'
          }

          if (mode === 'cors') {
            // Preflight
            result = { status: 204, headers }
          } else if (fn) {
            // Normal and fallback
            result = await this.fly.call(fn, Object.assign(evt, matched || {}), { eventId, eventType: 'http' })
          } else {
            // Non-exists
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

          if (!result) {
            result = {}
          } else if (result.constructor !== Object) {
            result = { body: String(result) }
          }
        } catch (err) {
          res.code(500).type('application/json').send({
            code: err.code || 500,
            message: err.message
          })
          debug(`backend failed: ${err.message}`, err.stack)
          return
        }

        // set headers
        if (result.headers) Object.assign(headers, result.headers)
        Object.keys(headers).forEach(key => res.header(key, headers[key]))

        // set redirect
        if (result.redirect) return res.redirect(result.status || 302, result.redirect)

        // set status
        if (result.status) res.code(result.status)

        // set type
        if (result.type) res.type(result.type)

        // return file
        if (result.file) return res.type(mime.getType(result.file)).send(fs.createReadStream(result.file))

        // empty body
        if (!result.body) {
          if (!result.status) res.code(204)
          return res.send('')
        }

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
      const port = this.config.port
      const address = this.config.address
      fastify.listen(port, address, (err, address) => {
        if (err) return reject(err)

        const table = new Table({
          head: ['Method', 'Path', 'Domain', 'Fn'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })

        this.BuildRoutes(functions).forEach(route =>
          table.push([route.method.toUpperCase(), route.path, (route.domain || []).join(', '), route.fn]))
        console.log(table.toString())
        resolve({ address })
      })
    })
  },

  BuildRoutes (functions) {
    return functions.map(fn => {
      let e = fn.events.http
      return { method: e.method || 'get', path: e.path, domain: e.domain, fn: fn.name }
    })
  },

  Find (functions, event) {
    let matched
    let mode = 'normal'
    let fn = functions.find(f => !!(matched = this.Match(event, f.events.http)))

    if (!fn) {
      fn = functions.find(f => !!(matched = this.Match(event, f.events.http, 'cors')))
      mode = 'cors'
    }

    if (!fn) {
      functions.find(f => f.events.http.fallback)
      mode = 'fallback'
    }

    return { fn, matched, mode }
  },

  Match (source, target, mode) {
    if (!target.path && target.default) target.path = target.default
    if (!target.method) target.method = 'get'
    if (!target.path) return false
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

    if ((mode !== 'cors' || source.method !== 'options') && source.method !== target.method && target.method !== '*') return false

    let params = {}
    keys.forEach((key, i) => {
      params[key.name] = matched[i + 1]
    })
    return { params: params, target, source }
  }
})
