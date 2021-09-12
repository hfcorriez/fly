const Table = require('cli-table3')
const fs = require('fs')
const mime = require('mime')
const { URL } = require('url')
const path = require('path')
const fastify = require('fastify')()
const { handleUpload, cleanUploadFiles, contentTypeRegex } = require('../../lib/multipartParser')

fastify.register(require('fastify-multipart'))
fastify.register(require('fastify-formbody'))

module.exports = {
  errors: {
    '404': fs.readFileSync(path.join(__dirname, './pages/404.html')),
    '500': fs.readFileSync(path.join(__dirname, './pages/500.html'))
  },

  configService: {
    singleton: false,
    name: 'Http Server',
    port: parseInt(process.env.PORT || 5000, 10),
    address: '127.0.0.1'
  },

  main (event, { fly, matchHttp }) {
    const { bind, port, cors, static: staticConfigs, context } = event

    if (staticConfigs && staticConfigs.length) {
      for (let staticConfig of staticConfigs) {
        fly.debug('register static:', staticConfig)
        fastify.register(require('fastify-static'), {
          root: path.join(fly.project.dir, staticConfig.root),
          prefix: staticConfig.prefix + (staticConfig.prefix.endsWith('/') ? '' : '/')
        })
      }
    }

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

        fly.info(evt.method, evt.url)

        if (evt.headers.cookie) {
          evt.headers.cookie.split(';').forEach(function (item) {
            const crumbs = item.split('=')
            if (crumbs.length > 1) evt.cookies[crumbs[0].trim()] = crumbs[1].trim()
          })
        }

        let result, err
        let eventId = request.headers['x-fly-id'] || null
        let headers = {}
        const { name, mode, params, target } = await matchHttp({ event: evt, config: event }) || {}
        evt.params = params

        try {
          const isCors = mode === 'cors' || (target && (target.cors !== false || cors))

          if (isCors) {
            headers = {
              'access-control-allow-origin': request.headers['origin'] || '*',
              'access-control-allow-methods': request.headers['access-control-request-method'] || 'GET,HEAD,PUT,PATCH,POST,DELETE',
              'access-control-allow-credentials': 'true',
              'access-control-allow-headers': request.headers['access-control-request-headers'] || '*'
            }

            if (target && typeof target.cors === 'string') {
              headers['access-control-allow-origin'] = target.cors
            } else if (target && typeof target.cors === 'object') {
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

          if (mode === 'cors') {
            fly.info(204, 'cors mode')
            // Preflight
            result = { status: 204 }
          } else if (name) {
            /**
             * Cache define
             */
            if (target.hasOwnProperty('cache') && (
              !target.method ||
              target.method.includes('get') ||
              target.method.includes('head'))) {
              if (['string', 'number'].includes(typeof target.cache) || target.cache === true) {
                headers['cache-control'] = `public, max-age=${target.cache === true ? 600 : target.cache}`
              } else if (!target.cache) {
                headers['cache-control'] = `no-cache, no-store`
              }
            }

            /**
             * multipart/form-data request, parse body, write temp file to temp dir
             */
            const isUpload = target.upload && evt.method === 'post' &&
              typeof evt.headers['content-type'] === 'string' &&
              contentTypeRegex.test(evt.headers['content-type'])

            let files = {}
            if (isUpload) {
              const formBody = await handleUpload(request, target.upload)
              evt.body = formBody.fieldPairs
              evt.files = formBody.files
            }

            // Normal and fallback
            [result, err] = await fly.call(name, evt, { eventId, eventType: 'http', ...context }, true)
            if (err) throw err

            // delete upload files after used
            if (isUpload && evt.files && Object.keys(evt.files).length) {
              await cleanUploadFiles(files)
            }
          }

          if (!name || !result) {
            // Non-exists
            if (this.errors['404']) {
              reply.code(404).type('text/html').send(this.errors['404'])
            } else {
              reply.code(404).type('application/json').send({
                code: 404,
                message: `path not found`
              })
            }
            this.log({ evt, reply, name }, fly)
            return
          } else if (result.constructor !== Object) {
            throw new Error('function return illegal')
          }
        } catch (err) {
          reply.code(500).type('application/json').send({
            code: err.code || 500,
            message: err.message,
            stack: fly.project.env === 'development' ? err.stack.split('\n') : undefined
          })
          fly.error(`backend failed with "[${err.name}] ${err.message}"`, err)
          this.log({ evt, reply, name }, fly)
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
          fs.stat(result.file, (err) => {
            if (err) {
              fly.warn('file read error:', result.file)
              reply.type('text/html').code(404).send(this.errors['404'])
            } else {
              reply.type(mime.getType(result.file)).send(fs.createReadStream(result.file))
            }
          })
        } else if (!result.body) {
          fly.info(204, 'no result body')
          // empty body
          if (!result.status) reply.code(204)
          reply.send('')
        } else if (result.hasOwnProperty('body')) {
          // send body
          if (!result.type && typeof result.body === 'string') reply.type('text/html')
          reply.send(result.body)
        } else if (this.errors['500']) {
          // no body and other options response 500
          reply.code(500).type('text/html').send(this.errors['500'])
        } else {
          reply.code(500).type('application/json').send({ message: 'no body return' })
        }
        this.log({ evt, reply, name }, fly)
      }
    })

    return new Promise((resolve, reject) => {
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)

        const table = new Table({
          head: ['Method', 'Path', 'Fn'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })

        this.buildRoutes(fly.find('http')).forEach(route =>
          table.push([route.method.toUpperCase(), route.path, route.fn]))
        console.log(table.toString())
        resolve({ address, $command: { wait: true } })
      })
    })
  },

  /**
   * Log
   *
   * @param {Object} event
   * @param {Object} reply
   * @param {Object} fn
   */
  log ({ evt: event, reply, name }, fly) {
    if (!require('tty').isatty(process.stderr.fd)) return
    let res = reply.raw
    fly.info([
      event.method.toLowerCase() + '/' + res.statusCode,
      event.host + event.path
    ].join(' '))
  },

  /**
   * Build routes
   *
   * @param {Array} functions
   */
  buildRoutes (functions) {
    return functions.map(fn => {
      let e = fn.events.http
      return { method: e.method || 'get', path: e.path, domain: e.domain, fn: fn.name }
    })
  }
}
