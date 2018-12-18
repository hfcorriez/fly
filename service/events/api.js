// Require the framework and instantiate it
const fastify = require('fastify')()
const debug = require('debug')('fly/srv/api')

module.exports = {
  config: {
    port: 5000
  },

  links: {
    _: process.cwd()
  },

  main: async function (event, ctx) {
    /**
     * Rpc server
     */
    fastify.options('/*', async (request, reply) => {
      reply.send('')
    })

    fastify.post('/:fn', async (request, reply) => {
      try {
        let context = { callType: 'rpc' }

        if (request.headers['x-fly-id']) {
          context.id = request.headers['x-fly-id']
        }

        if (request.headers['x-fly-async']) {
          context.async = request.headers['x-fly-async'] === '1'
        }

        context.eventType = request.headers['x-fly-type'] || 'api'

        // Check if async will async to do, such as background jobs
        if (context.async) {
          reply.send({ code: 0, data: null })
          ctx.call(request.params.fn, request.body || {}, context)
        } else {
          let data = await ctx.call(request.params.fn, request.body || {}, context)
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
      fastify.listen(port, function (err) {
        if (err) return reject(err)
        resolve(port)
      })
    })
  }
}


