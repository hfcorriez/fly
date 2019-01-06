const fastify = require('fastify')()
const debug = require('debug')('fly/evt/htt')

module.exports = Object.assign({}, require('../lib/server'), {
  server: {
    command: 'api',
    name: 'API'
  },

  config: {
    address: '127.0.0.1',
    port: parseInt(process.env.PORT || 5000, 10)
  },

  run: function (event, ctx) {
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
          this.fly.call(request.params.fn, request.body || {}, context)
        } else {
          let data = await this.fly.call(request.params.fn, request.body || {}, context)
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
      const address = event.address || this.config.address
      fastify.listen(port, address, function (err, address) {
        if (err) return reject(err)
        resolve({ address })
      })
    })
  }
})
