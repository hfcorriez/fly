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
    if (!fn) {
      throw new Error(`service "${service}" not found`)
    }
    const serviceConfig = fn.events.service
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
        await pm.start({
          name,
          args: ['service', 'run', name],
          instance: serviceConfig.singleton ? 1 : config.instance,
          env: {
            BIND: config.bind || serviceConfig.bind,
            PORT: config.port || serviceConfig.port
          }
        })
        await pm.status(name)
        break
      case 'run':
        const ret = await fly.call(fn, {
          bind: serviceConfig.bind,
          port: serviceConfig.port,
          ...config
        }, { eventType: 'service' })

        console.log(colors.green(`[SERVICE] ${serviceConfig.title}`))
        console.log(utils.padding('  NAME:', 12), colors.bold(name))
        console.log(utils.padding('  TYPE:', 12), colors.bold(serviceConfig.name))
        ret && ret.address && console.log(utils.padding('  ADDRESS:', 12), colors.bold(ret.address))
        console.log(utils.padding('  PID:', 12), colors.bold(process.pid))
        console.log(utils.padding('  WORK DIR:', 12), colors.bold(process.cwd()))
        console.log(utils.padding('  HOTRELOAD:', 12), colors.bold(ctx.fly.config.hotreload))
        return { wait: true }
    }
  },

  catch (error) {
    console.log(colors.red(`SERVER ERROR`))
    console.log(utils.padding('  MESSAGE:', 12), colors.bold(error.message))
    console.log(utils.padding('  STACK:', 12), colors.bold(error.stack))
  },

  configCommand: {
    _: `service <command> <service>`,
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
      '[command]': 'list | run | start | stop | reload | restart | status | log',
      '--instance': 'The instance number',
      '--bind': 'Bind address',
      '--port': 'Bind port'
    }
  }
}
