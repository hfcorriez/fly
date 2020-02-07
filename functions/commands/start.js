const debug = require('debug')('fly/server')
const PM = require('../../lib/pm')
const colors = require('colors/safe')
const utils = require('../../lib/utils')
const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  async main (event, ctx) {
    const { args, params } = event
    const { command, service } = params
    const config = args

    // Hot reload
    const fly = ctx.fly
    const fn = fly.list('service').find(i => i.events.service && i.events.service.name === service)
    const serviceConfig = fn ? fn.events.service : null
    const name = process.cwd().split('/').pop()
    const pm = new PM({
      name: `fly:${service}`,
      path: process.argv[1]
    })

    switch (command) {
      case 'list':
        await new PM({
          name: `fly`,
          path: process.argv[1]
        }).status('all')
        break
      case 'status':
        await pm.status(name)
        break
      case 'log':
        await pm.log(name)
        break
      case 'end':
      case 'stop':
        await pm.stop(name)
        await pm.status(name)
        break
      case 'restart':
        await pm.restart(name)
        await pm.status(name)
        break
      case 'reload':
        await pm.reload(name)
        await pm.status(name)
        break
      case 'start':
        if (!fn) throw new Error(`service "${service}" not found`)
        await pm.start({
          name,
          args: ['run', name],
          instance: serviceConfig.singleton ? 1 : config.instance,
          env: {
            BIND: config.bind || serviceConfig.bind,
            PORT: config.port || serviceConfig.port
          }
        })
        await pm.status(name)
        break
      case 'run':
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
    }
  },

  catch (error) {
    console.log(colors.red(`SERVER ERROR`))
    console.log(utils.padding('MESSAGE:'.padStart(9)), colors.bold(error.message))
    console.log(utils.padding('STACK:'.padStart(9)), colors.bold(error.stack))
  },

  configCommand: {
    _: `start [service]`,
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
      _: `start service`,
      '--instance': 'The instance number',
      '--bind': 'Bind address',
      '--port': 'Bind port'
    }
  }
}
