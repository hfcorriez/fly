const Table = require('cli-table3')
const fs = require('fs')
const mime = require('mime')
const { URL } = require('url')
const path = require('path')
const axios = require('axios')
const fastify = require('fastify')()
const colors = require('colors/safe')
const os = require('os')
const { parseFormData, deleteTempFiles } = require('../../lib/multipartParser')

fastify.register(require('fastify-multipart'))
fastify.register(require('fastify-xml-body-parser'))
fastify.register(require('fastify-formbody'))

const MULTIPART_REGEXP = /^multipart\/form-data/i
const TMP_DIR = path.join(os.tmpdir(), 'flyhttp')

module.exports = {
  errors: {
    '404': fs.readFileSync(path.join(__dirname, './pages/404.html')),
    '500': fs.readFileSync(path.join(__dirname, './pages/500.html'))
  },

  configService: {
    name: 'http',
    singleton: false,
    title: 'Http Server',
    port: parseInt(process.env.PORT || 5000, 10),
    address: '127.0.0.1'
  },

  main (event, ctx) {
    const { bind, port, cors, static: staticConfigs } = event
    const { fly, project, matchHttp } = ctx

    try {
      !fs.existsSync(TMP_DIR) && fs.mkdirSync(TMP_DIR)
    } catch (err) {
      if (err) {
        const msg = `tmp dir create failed: ${TMP_DIR} ${err.message}`
        fly.error(msg)
        process.exit(1)
      }
    }
    fly.info('tmp dir:', TMP_DIR)

    if (staticConfigs && staticConfigs.length) {
      for (let staticConfig of staticConfigs) {
        fly.info('register static:', staticConfig)
        fastify.register(require('fastify-static'), {
          root: path.join(project.dir, staticConfig.root),
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
            fly.debug(204, 'cors mode')
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
              MULTIPART_REGEXP.test(evt.headers['content-type'])

            let files = {}
            if (isUpload) {
              const formBody = await parseFormData(request, target.upload, TMP_DIR)
              evt.body = formBody.fieldPairs
              evt.files = formBody.files
              files = formBody.files
            }

            // Normal and fallback
            [result, err] = await fly.call(name, evt, { eventId, eventType: 'http' }, true)
            if (err) throw err

            // delete temp files uploaded
            if (isUpload) {
              await deleteTempFiles(files)
            }

            // Handle url
            if (result && result.url) {
              let res
              try {
                res = await axios({ url: result.url }, { responseType: 'stream' })
              } catch (err) {
                res = err.response
              }
              // console.log(res.headers)
              // Object.assign(headers, res.headers)
              Object.assign(result, { status: res.status, body: res.data, url: undefined })
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
            this.log(evt, reply, name)
            return
          } else if (result.constructor !== Object) {
            throw new Error('function return illegal')
          }
        } catch (err) {
          reply.code(500).type('application/json').send({
            code: err.code || 500,
            message: err.message,
            stack: ctx.project.env === 'development' ? err.stack.split('\n') : undefined
          })
          fly.error(`backend failed with "[${err.name}] ${err.message}"`, err)
          this.log(evt, reply, name)
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
              fly.warn('file read error:', err)
              reply.type('text/html').code(404).send(this.errors['404'])
            } else {
              reply.type(mime.getType(result.file)).send(fs.createReadStream(result.file))
            }
          })
        } else if (!result.body) {
          fly.debug(204, 'no result body')
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
        this.log(evt, reply, name)
      }
    })

    return new Promise((resolve, reject) => {
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)

        const table = new Table({
          head: ['Method', 'Path', 'Fn'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })

        this.buildRoutes(fly.list('http')).forEach(route =>
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
  log (event, reply, name) {
    if (!require('tty').isatty(process.stderr.fd)) return
    let res = reply.res
    console.log([
      res.statusCode < 300 ? colors.green(res.statusCode) : (res.statusCode < 400 ? colors.yellow(res.statusCode) : colors.red(res.statusCode)),
      event.method.toUpperCase(),
      event.path,
      colors.grey(name || '-')
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
