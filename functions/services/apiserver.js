const fastify = require('fastify')()
const path = require('path')
const Table = require('cli-table2')
const colors = require('colors/safe')

module.exports = {
  configService: {
    name: 'apiserver',
    title: 'Fly API Server',
    port: 4000,
    endpoint: '',
    keys: [],
    functions: []
  },

  main (event, ctx) {
    const { bind, port, endpoint, keys, functions } = event

    fastify.options(path.join('/', endpoint), async (_, reply) => reply.send(''))
    fastify.post(path.join('/', endpoint), async (request, reply) => {
      const key = request.headers['x-fly-key']

      if (keys && keys.length && !keys.includes(key)) {
        reply.send({
          code: 100,
          message: 'auth failed'
        })
        return
      }

      const { name, event = {}, context = {} } = request.body || {}
      if (!context.eventType) context.eventType = 'api'

      if (!name || name.startsWith('$') || (functions && functions.length && !functions.includes(name))) {
        reply.send({
          code: 101,
          message: 'function not exists'
        })
        return
      }

      this.Log(name, context, event)

      // Check if async will async to do, such as background jobs
      if (context.async) {
        ctx.call(name, event, context)
        reply.send({ code: 0, message: 'no result with async call', data: null })
      } else {
        const [result, err] = await ctx.call(name, event, context)

        if (!err) {
          reply.send({ code: 0, data: result })
        } else {
          ctx.info('call function error:', err.message, err)
          reply.send({
            code: err.code || 1,
            message: err.message || 'call function failed'
          })
        }
      }
    })

    return new Promise((resolve, reject) => {
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)

        const table = new Table({
          head: ['Fn', 'Path'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })
        ctx.list().filter(fn => !fn.name.startsWith('$')).forEach(fn => table.push([fn.name, fn.path]))
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
