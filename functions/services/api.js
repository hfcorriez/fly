const path = require('path')
const Table = require('cli-table3')
const colors = require('colors/safe')

module.exports = {
  configService: {
    name: 'Fly API server',
    port: 4000,
    endpoint: '',
    keys: [],
    functions: [],
    useContext: false,
  },

  main (event, { fly }) {
    const { bind, port, endpoint, keys, functions, useContext } = event

    const fastify = require('fastify')()
    fastify.options(path.join('/', endpoint), async (_, reply) => reply.send(''))
    fastify.post(path.join('/', endpoint), async (request, reply) => {
      const key = request.headers['x-fly-key']

      if (keys && keys.length && !keys.includes(key)) {
        reply.send({
          code: 100,
          message: 'auth failed',
        })
        return
      }

      const { name, event = {}, context: userContext } = request.body || {}
      const context = { eventType: 'api' }
      if (useContext) {
        Object.assign(context, userContext || {})
      }

      if (!name || name.startsWith('$') || (functions && functions.length && !functions.includes(name))) {
        reply.send({
          code: 101,
          message: 'function not exists',
        })
        return
      }

      this.log(name, context, event)

      // Check if async will async to do, such as background jobs
      if (context.async) {
        fly.call(name, event, context, true)
        reply.send({ code: 0, message: 'no result with async call', data: null })
      } else {
        const [result, err] = await fly.call(name, event, context)

        if (!err) {
          reply.send({ code: 0, data: result })
        } else {
          fly.info('call function error:', err.message, err)
          reply.send({
            code: err.code || 1,
            message: err.message || 'call function failed',
          })
        }
      }
    })

    return new Promise((resolve, reject) => {
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)

        const table = new Table({
          head: ['Fn', 'Path'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
        })
        fly.find().filter(fn => !fn.name.startsWith('$')).forEach(fn => table.push([fn.name, fn.path]))
        console.log(table.toString())
        resolve({ address, $command: { wait: true } })
      })
    })
  },

  log (fn, ctx, body) {
    console.log([
      '+',
      colors.green(fn),
      '{',
      Object.keys(body).join(', '),
      '}',
      ctx.id || '-',
    ].join(' '))
  },
}
