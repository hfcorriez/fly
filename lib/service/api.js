// Require the framework and instantiate it
const fastify = require('fastify')()
const debug = require('debug')('fly/app/htt')

exports.start = async (fly, { dir, port, errors }) => {
  /**
   * Rpc server
   */
  fastify.options('/rpc/*', async (request, reply) => {
    reply.send('')
  })

  fastify.post('/rpc/:fn', async (request, reply) => {
    try {
      let ctx = { callType: 'rpc' }

      if (request.headers['x-fly-id']) {
        ctx.id = request.headers['x-fly-id']
      }

      if (request.headers['x-fly-async']) {
        ctx.async = request.headers['x-fly-async'] === '1'
      }

      if (request.headers['x-fly-eventtype']) {
        ctx.eventType = request.headers['x-fly-eventtype']
      }

      // Check if async will async to do, such as background jobs
      if (ctx.async) {
        reply.send({ code: 0, data: null })
        fly.call(request.params.fn, request.body || {}, ctx)
      } else {
        let data = await fly.call(request.params.fn, request.body || {}, ctx)
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
}
