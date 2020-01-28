const fastify = require('fastify')()
const path = require('path')
const debug = require('debug')('fly/evt/htt')
const Fly = require('../lib/fly')

module.exports = {
  configService: {
    name: 'api',
    title: 'Fly API Server',
    endpoint: ''
  },

  main (event, ctx) {
    const { bind, port, hotreload } = event
    const fly = new Fly({
      hotreload
    }, ctx.fly)

    /**
     * Rpc server
     */
    fastify.options(path.join('/', this.configService.endpoint, '*'), async (_, reply) => reply.send(''))
    fastify.post(path.join('/', this.configService.endpoint, ':fn'), async (request, reply) => {
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
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)
        resolve({ address })
      })
    })
  }
}
