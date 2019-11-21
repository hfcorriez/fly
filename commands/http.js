const Table = require('cli-table2')
const fs = require('fs')
const mime = require('mime')
const pathToRegexp = require('path-to-regexp')
const { URL } = require('url')
const path = require('path')
const axios = require('axios')
const fastify = require('fastify')()
const colors = require('colors/safe')
const Fly = require('../lib/fly')
const os = require('os')
const { parseFormData, deleteTempFiles } = require('../lib/multipartParser')
const debug = require('debug')('fly/evt/htt')

fastify.register(require('fastify-multipart'))
fastify.register(require('fastify-xml-body-parser'))

const MULTIPART_REGEXP = /^multipart\/form-data/i
const TMP_DIR = path.join(os.tmpdir(), 'flyjs')

module.exports = {
  extends: './server',

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
    try {
      if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR)
      }
    } catch (err) {
      if (err) {
        const msg = `Failed to create temp dir ${TMP_DIR} for malus, err: ${err.message}`
        console.log(msg)
        debug(msg)
        process.exit(1)
      }
    }
    debug('malus temp dir is ', TMP_DIR)
  },

  run () {
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
        const { fn, mode, params, target } = this.Find(evt) || {}
        evt.params = params

        try {
          if (mode === 'cors' || (target && target.cors)) {
            headers = {
              'access-control-allow-origin': request.headers['origin'] || '*',
              'access-control-allow-methods': request.headers['access-control-request-method'] || 'GET,HEAD,PUT,PATCH,POST,DELETE',
              'access-control-allow-credentials': 'true',
              'access-control-allow-headers': request.headers['access-control-request-headers'] || '*'
            }

            if (target && target.cors) {
              if (typeof target.cors === 'string') {
                headers['access-control-allow-origin'] = target.cors
              } else if (typeof target.cors === 'object') {
                Object.keys(target.cors).forEach(key => {
                  const value = target.cors[key]
                  switch (key) {
                    case 'origin':
                      headers['access-control-allow-origin'] = value
                      break
                    case 'methods':
                      headers['access-control-allow-methods'] = value
                      break
                    case 'headers':
                      headers['access-control-allow-headers'] = value
                      break
                    case 'credentials':
                      if (value === false) {
                        delete headers['access-control-allow-credentials']
                      }
                      break
                  }
                })
              }
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
            /**
             * multipart/form-data request, parse body, write temp file to temp dir
             */
            const isUpload = target.upload && evt.method === 'post' &&
              typeof evt.headers['content-type'] === 'string' &&
              MULTIPART_REGEXP.test(evt.headers['content-type'])

            let files = {}
            if (isUpload) {
              const formBody = await parseFormData(request, target.upload, TMP_DIR)
              evt.body = formBody.fieldPairs
              evt.files = formBody.files
              files = formBody.files
            }

            // Normal and fallback
            result = await this.fly.call(fn.name, evt, { eventId, eventType: 'http' })

            // delete temp files uploaded
            if (isUpload) {
              await deleteTempFiles(files)
            }

            // Handle url
            if (result && result.url) {
              let res
              try {
                res = await axios({
                  url: result.url
                  // headers: request.headers
                }, { responseType: 'stream' })
              } catch (err) {
                res = err.response
              }
              // console.log(res.headers)
              // Object.assign(headers, res.headers)
              Object.assign(result, { status: res.status, body: res.data, url: undefined })
            }
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
          fs.stat(result.file, (err, stat) => {
            if (err) {
              debug(err)
              reply.type('text/html').code(404).send(this.config.errors['404'])
            } else {
              reply.type(mime.getType(result.file)).send(fs.createReadStream(result.file))
            }
          })
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
          reply.code(500).type('application/json').send('no body return')
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
          head: ['Method', 'Path', 'Fn'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })

        this.BuildRoutes(this.fly.list('http')).forEach(route =>
          table.push([route.method.toUpperCase(), route.path, route.fn]))
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

  Find (event) {
    let matched
    let secondaryMatched
    let fallbackMatched

    this.fly.list('http').some(fn => {
      const matchedInfo = this.Match(event, fn.events.http)

      // No match
      if (!matchedInfo.match) return false

      // Set fn
      matchedInfo.fn = fn

      // Match not found and matched length less than current
      if (!matchedInfo.mode && (!matched || matched.length > matchedInfo.length)) {
        matched = matchedInfo
        if (matchedInfo.length === 0) return true
      } else if (matchedInfo.mode === 'fallback' && !fallbackMatched) {
        fallbackMatched = matchedInfo
      } else if (matchedInfo.mode) {
        secondaryMatched = matchedInfo
      }
      return false
    })

    return matched || secondaryMatched || fallbackMatched
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
    // change target.method
    target.method = target.method.toLowerCase()

    if (target.path[0] !== '/') {
      console.warn('warn: http path is not start with "/", recommend to add it')
      target.path = '/' + target.path
    }

    let keys = []
    let regex = pathToRegexp(target.path, keys)
    let pathMatched = regex.exec(source.path)
    let mode = null
    let match = false
    let matchLength = 0
    let params = {}

    if (pathMatched) {
      matchLength = (pathMatched[1] || '').length
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

    return { match, length: matchLength, mode, path: !!pathMatched, params, target, source }
  }

}
