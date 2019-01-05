const fs = require('fs')
const path = require('path')
const fastify = require('fastify')()
const Fly = require('../lib/fly')
const debug = require('debug')('fly/evt/htt')
const PM = require('../lib/pm')

module.exports = {
  config: {
    port: parseInt(process.env.PORT || 5000, 10),
    errors: {
      '404': fs.readFileSync(path.join(__dirname, './http/404.html')),
      '500': fs.readFileSync(path.join(__dirname, './http/500.html'))
    }
  },

  main: async function (event, ctx) {
    let name = process.cwd().split('/').pop()

    if (event.args.foreground) {
      const fly = new Fly()
      /**
     * Rpc server
     */
      fastify.options('/*', async (request, reply) => {
        reply.send('')
      })

      fastify.post('/:fn', async (request, reply) => {
        try {
          let context = { eventType: 'api' }
          if (request.headers['x-fly-id']) context.id = request.headers['x-fly-id']
          if (request.headers['x-fly-async']) context.async = request.headers['x-fly-async'] === '1'
          if (request.headers['x-fly-type']) context.eventType = request.headers['x-fly-type'] || 'api'

          // Check if async will async to do, such as background jobs
          if (context.async) {
            reply.send({ code: 0, data: null })
            fly.call(request.params.fn, request.body || {}, context)
          } else {
            let data = await fly.call(request.params.fn, request.body || {}, context)
            reply.send({ code: 0, data })
          }
        } catch (err) {
          debug('call function error:', err.message, err)
          reply.send({
            code: err.code || 1,
            message: err.message || 'call function error'
          })
        }
      })

      return new Promise((resolve, reject) => {
        const port = event.port || this.config.port
        fastify.listen(port, function (err, address) {
          if (err) return reject(err)
          resolve({ address })
        })
      })
    }

    const pm = new PM({
      name: 'fly:api',
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

  configCommand: {
    _: 'api [command]',
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
      _: 'Api service',
      '[command]': 'start | stop | reload | restart | status | log',
      '--port': 'Bind port',
      '--foreground': 'Run in foreground',
      '--instance': 'The instance number',
      '--all': 'All applications'
    }
  }
}
