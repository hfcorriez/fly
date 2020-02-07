const debug = require('debug')('fly/server')
const colors = require('colors/safe')
const utils = require('../../lib/utils')
const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  async main (event, ctx) {
    const { args, params } = event
    const { service } = params
    const config = args
    const fly = ctx.fly
    const fn = fly.list('service').find(i => i.events.service && i.events.service.name === service)
    const serviceConfig = fn ? fn.events.service : null
    const name = process.cwd().split('/').pop()

    if (!fn) throw new Error(`service "${service}" not found`)
    await fly.broadcast('startup')
    debug('STARTUP...', serviceConfig)

    let stop = false
    EXIT_SIGNALS.forEach(status => process.on(status, async () => {
      try {
        if (stop) return
        stop = true
        await fly.broadcast('shutdown')
        debug('SHUTDOWN', status)

        process.exit(0)
      } catch (err) {
        console.error(`shutdown with error: ${err.message} `)
        process.exit(1)
      }
    }))

    const ret = await fly.call(fn, {
      ...serviceConfig,
      ...config
    }, { eventType: 'service' })

    console.log(colors.green(`[SERVICE] ${serviceConfig.title}`))
    console.log(utils.padding('NAME: '.padStart(9)), colors.bold(name))
    console.log(utils.padding('TYPE: '.padStart(9)), colors.bold(serviceConfig.name))
    ret && ret.address && console.log(utils.padding('ADDRESS: '.padStart(9)), colors.bold(ret.address))
    console.log(utils.padding('PID: '.padStart(9)), colors.bold(process.pid))
    console.log(utils.padding('ENV: '.padStart(9)), colors.bold(ctx.config.env))
    return { wait: true }
  },

  catch (error) {
    console.log(colors.red(`SERVER ERROR`))
    console.log(utils.padding('MESSAGE:'.padStart(9)), colors.bold(error.message))
    console.log(utils.padding('STACK:'.padStart(9)), colors.bold(error.stack))
  },

  configCommand: {
    _: `run [service]`,
    args: {
      '--instance': Number,
      '--bind': String,
      '--port': Number
    },
    alias: {
      '--instance': '-i',
      '--bind': '-b',
      '--port': '-p'
    },
    descriptions: {
      _: `service`,
      '--instance': 'The instance number',
      '--bind': 'Bind address',
      '--port': 'Bind port'
    }
  }
}
