const Table = require('cli-table2')
const fs = require('fs')
const mime = require('mime')
const pathToRegexp = require('path-to-regexp')
const { URL } = require('url')
const path = require('path')
const fastify = require('fastify')()
const debug = require('debug')('fly/evt/htt')
const PM = require('../lib/pm')
const Fly = require('../lib/fly')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  config: {
    port: parseInt(process.env.PORT || 5000, 10),
    errors: {
      '404': fs.readFileSync(path.join(__dirname, './http/404.html')),
      '500': fs.readFileSync(path.join(__dirname, './http/500.html'))
    }
  },

  before: async function (event) {
    this.fly = new Fly()
    this.functions = this.fly.list('http').sort((a, b) => (b.events.http.priority || 0) - (a.events.http.priority || 0))

    await this.fly.broadcast('startup')
    debug('startup...')

    // process.on('uncaughtException', (err) => {
    //   console.error('uncaughtException', err)
    // })

    let stop = false
    EXIT_SIGNALS.forEach(status => process.on(status, async () => {
      if (stop) return
      try {
        stop = true
        await this.fly.broadcast('shutdown')
        debug('shutdown')
        process.exit(0)
      } catch (err) {
        console.error(`shutdown with error: ${err.message} `)
        process.exit(1)
      }
    }))

    return event
  },

  main: async function (event, ctx) {
    let name = process.cwd().split('/').pop()

    if (event.args.foreground) {
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
            let fn = this.functions.find(f => !!(matched = this.match(evt, f.events.http))) || this.functions.find(f => f.events.http.fallback)

            if (fn) {
              result = await this.fly.call(fn, Object.assign(evt, matched || {}), { eventId, eventType: 'http' })
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

          if (result.headers) Object.keys(result.headers).forEach(key => res.header(key, result.headers[key]))
          if (result.redirect) return res.redirect(result.status || 302, result.redirect)
          if (result.file) return res.type(mime.getType(result.file)).send(fs.createReadStream(result.file))
          if (result.headers && !result.body) return res.send('')
          if (result.status) res.code(result.status)
          if (result.type) res.type(result.type)

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
        const port = event.port || this.config.port
        fastify.listen(port, (err, address) => {
          if (err) return reject(err)

          const table = new Table({
            head: ['Method', 'Path', 'Domain', 'Fn'],
            chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
          })

          this.buildRoutes().forEach(route =>
            table.push([route.method.toUpperCase(), route.path, (route.domain || []).join(', '), route.fn]))
          console.log(table.toString())

          console.log(`fly http: ${address}`)

          resolve(true)
        })
      })
    }

    const pm = new PM({
      name: 'fly:http',
      path: process.argv[1]
    })

    let names = !event.args.all && name

    switch (event.params.command) {
      case 'list':
      case 'status':
        await pm.status(names)
        break
      case 'log':
        await pm.log(names)
        break
      case 'end':
      case 'stop':
        await pm.stop(names)
        await pm.status(names)
        break
      case 'restart':
        await pm.restart(names)
        await pm.status(names)
        break
      case 'reload':
        await pm.reload(names)
        await pm.status(names)
        break
      case 'start':
      case undefined:
        await pm.start({
          name,
          args: ['up', '-f'],
          instance: event.args.instance,
          env: {
            PORT: event.args.port || 5000
          }
        })
        await pm.status(name)
        break
    }
  },

  after: function (event) {
    !event && process.exit(0)
  },

  buildRoutes: function () {
    return this.functions.map(fn => {
      let e = fn.events.http
      return { method: e.method || 'get', path: e.path, domain: e.domain, fn: fn.name }
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
  },

  configCommand: {
    _: 'http [command]',
    args: {
      '--port': Number,
      '--foreground': Boolean,
      '--instance': Number,
      '--all': Boolean
    },
    alias: {
      '--port': '-p',
      '--foreground': '-f',
      '--instance': '-i',
      '--all': '-a'
    },
    descriptions: {
      _: 'Manage http service',
      '[command]': 'start | stop | reload | restart | status | log',
      '--port': 'Bind port',
      '--foreground': 'Run in foreground',
      '--instance': 'The instance number',
      '--all': 'All applications'
    }
  }
}
