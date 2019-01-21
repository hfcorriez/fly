const Table = require('cli-table2')
const fs = require('fs')
const mime = require('mime')
const pathToRegexp = require('path-to-regexp')
const { URL } = require('url')
const path = require('path')
const fastify = require('fastify')()
const colors = require('colors/safe')
const Fly = require('../lib/fly')
const debug = require('debug')('fly/evt/htt')

module.exports = {
  extends: '../lib/server',

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

  init () {
    this.fly = new Fly()
  },

  run () {
    const functions = this.fly.list('http').sort((a, b) => (b.events.http.priority || 0) - (a.events.http.priority || 0))

    fastify.route({
      method: ['GET', 'POST', 'HEAD', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
      url: '/*',
      handler: async (request, reply) => {
        const urlObj = new URL('http://' + request.headers.host + request.raw.url)

        let evt = {
          method: request.raw.method.toLowerCase(),
          path: urlObj.pathname,
          origin: urlObj.origin,
          host: urlObj.host,
          domain: urlObj.hostname,
          url: urlObj.href,
          protocol: urlObj.protocol,
          port: urlObj.port,
          ip: String(request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || request.raw.socket.remoteAddress).split(',').shift(),
          headers: request.headers || {},
          body: request.body || {},
          query: request.query || {},
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
        let eventId = request.headers['x-fly-id'] || null
        let headers = {}
        const { fn, mode, params, target } = this.Find(functions, evt) || {}

        try {
          if (mode === 'cors' || (target && target.cors)) {
            headers = {
              'access-control-allow-origin': request.headers['origin'] || '*',
              'access-control-allow-methods': request.headers['access-control-request-method'] || 'GET,HEAD,PUT,PATCH,POST,DELETE',
              'access-control-allow-credentials': 'true',
              'access-control-allow-headers': request.headers['access-control-request-headers'] || '*'
            }
          }

          if (mode === 'cors') {
            // Preflight
            result = { status: 204 }
          } else if (fn) {
            /**
             * Cache define
             */
            if (target.hasOwnProperty('cache') && ['get', 'head', undefined].includes(target.method)) {
              if (['string', 'number'].includes(typeof target.cache) || target.cache === true) {
                if (target.cache === true) target.cache = 600
                headers['cache-control'] = `public, max-age=${target.cache}`
              } else if (!target.cache) {
                headers['cache-control'] = `no-cache, no-store`
              }
            }

            // Normal and fallback
            result = await this.fly.call(fn.name, Object.assign(evt, { params }), { eventId, eventType: 'http' })
          }

          if (!fn || !result) {
            // Non-exists
            if (this.config.errors['404']) {
              reply.code(404).type('text/html').send(this.config.errors['404'])
            } else {
              reply.code(404).type('application/json').send({
                code: 404,
                message: `path not found`
              })
            }
            this.Log(evt, reply, fn)
            return
          } else if (result.constructor !== Object) {
            throw new Error('function return illegal')
          }
        } catch (err) {
          reply.code(500).type('application/json').send({
            code: err.code || 500,
            message: err.message
          })
          debug(`backend failed: ${err.message}`, err.stack)
          this.Log(evt, reply, fn)
          return
        }

        // set headers
        if (result.headers) Object.assign(headers, result.headers)
        Object.keys(headers).forEach(key => reply.header(key, headers[key]))

        // set status
        if (result.status) reply.code(result.status)
        // set type
        if (result.type) reply.type(result.type)

        if (result.redirect) {
          // set redirect
          reply.redirect(result.status || 302, result.redirect)
        } else if (result.file) {
          // return file
          reply.type(mime.getType(result.file)).send(fs.createReadStream(result.file))
        } else if (!result.body) {
          // empty body
          if (!result.status) reply.code(204)
          reply.send('')
        } else if (result.hasOwnProperty('body')) {
          // send body
          if (!result.type && typeof result.body === 'string') reply.type('text/html')
          reply.send(result.body)
        } else if (this.config.errors['500']) {
          // no body and other options response 500
          reply.code(500).type('text/html').send(this.config.errors['500'])
        } else {
          reply.code(500).type('application/json').send({
            code: 500,
            message: 'no body return'
          })
        }
        this.Log(evt, reply, fn)
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
          table.push([route.method.toUpperCase(), route.path, route.domain, route.fn]))
        console.log(table.toString())
        resolve({ address })
      })
    })
  },

  Log (event, reply, fn) {
    let res = reply.res
    console.log([
      res.statusCode < 300 ? colors.green(res.statusCode) : (res.statusCode < 400 ? colors.yellow(res.statusCode) : colors.red(res.statusCode)),
      event.method.toUpperCase(),
      event.path,
      colors.grey(fn ? fn.path : '-')
    ].join(' '))
  },

  BuildRoutes (functions) {
    return functions.map(fn => {
      let e = fn.events.http
      return { method: e.method || 'get', path: e.path, domain: e.domain, fn: fn.name }
    })
  },

  Find (functions, event) {
    let matchedInfo
    let secondaryMatchedInfo
    let fallbackMatchInfo

    let matchedFn = functions.some(func => {
      // get matched info
      matchedInfo = this.Match(event, func.events.http)
      // no match
      if (matchedInfo.match) {
        // save fn
        matchedInfo.fn = func
        // match fully
        if (!matchedInfo.mode) return true
        // fallback match
        if (matchedInfo.mode === 'fallback') fallbackMatchInfo = matchedInfo
        // secondary matched
        else if (matchedInfo.mode) secondaryMatchedInfo = matchedInfo
      }
      return false
    })

    return (matchedFn && matchedInfo) || secondaryMatchedInfo || fallbackMatchInfo
  },

  /**
   * Match
   *
   * @param {Object} source
   * @param {Object} target
   */
  Match (source, target) {
    if (!target.path && target.default) target.path = target.default
    if (!target.method) target.method = 'get'
    if (!target.path) return false
    if (source.domain.split('.').length !== 4 && target.domain) {
      if (typeof target.domain === 'string') target.domain = [target.domain]
      let domainValid = target.domain.some(domain => new RegExp('^' + domain.replace(/\./g, '\\.').replace(/\*/g, '.*?') + '$').test(source.domain))
      if (!domainValid) return false
    }

    if (target.path[0] !== '/') {
      console.warn('warn: http path is not start with "/", recommend to add it')
      target.path = '/' + target.path
    }

    let keys = []
    let regex = pathToRegexp(target.path, keys)
    let pathMatched = regex.exec(source.path)
    let mode = null
    let match = false
    let params = {}

    if (pathMatched) {
      keys.forEach((key, i) => (params[key.name] = pathMatched[i + 1]))

      // method match
      if (!match && (source.method === target.method || target.method === '*')) {
        match = true
      }

      // cors match
      if (!match && source.method === 'options' && target.cors) {
        match = true
        mode = 'cors'
      }

      // head match
      if (!match && source.method === 'head' && (target.method === 'get' || target.method === '*')) {
        match = true
        mode = 'head'
      }

      if (!match && target.fallback) {
        match = true
        mode = 'fallback'
      }
    }

    return { match, mode, path: !!pathMatched, params, target, source }
  }
}
