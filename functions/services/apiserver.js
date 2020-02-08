const fastify = require('fastify')()
const path = require('path')
const debug = require('debug')('fly/srv/htt')
const Table = require('cli-table2')
const colors = require('colors/safe')

module.exports = {
  configService: {
    name: 'apiserver',
    title: 'Fly API Server',
    port: 5020,
    endpoint: ''
  },

  main (event, ctx) {
    const { bind, port, endpoint } = event

    /**
     * Rpc server
     */
    fastify.options(path.join('/', endpoint, '*'), async (_, reply) => reply.send(''))
    fastify.post(path.join('/', endpoint, ':fn'), async (request, reply) => {
      try {
        let context = { eventType: 'api' }
        if (request.headers['x-fly-id']) context.id = request.headers['x-fly-id']
        if (request.headers['x-fly-async']) context.async = request.headers['x-fly-async'] === '1'
        if (request.headers['x-fly-type']) context.eventType = request.headers['x-fly-type'] || 'api'

        const body = request.body || {}
        const fn = request.params.fn
        this.Log(fn, context, body)

        // Check if async will async to do, such as background jobs
        if (context.async) {
          reply.send({ code: 0, data: null })
          ctx.call(fn, body || {}, context)
        } else {
          let data = await ctx.call(fn, body || {}, context)
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

        const table = new Table({
          head: ['Fn', 'Path'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })
        ctx.list().forEach(fn => table.push([fn.name, fn.path]))
        console.log(table.toString())
        resolve({ address, $command: { wait: true } })
      })
    })
  },

  Log (fn, ctx, body) {
    console.log([
      '+',
      colors.green(fn),
      '{',
      Object.keys(body).join(', '),
      '}',
      ctx.id || '-'
    ].join(' '))
  }
}
