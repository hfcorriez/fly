const PM = require('../../lib/pm')
const colors = require('colors/safe')
const utils = require('../../lib/utils')

module.exports = {
  async main (event, ctx) {
    const { args, params: { service } } = event

    const fns = ctx.list('service')
      .filter(fn => service === 'all' ? Object.keys(ctx.service).includes(fn.name) : fn.events.service.name === service)

    if (!fns || !fns.length) {
      throw new Error(`service ${service} not found`)
    }

    // Hot reload
    const pm = new PM({
      name: `fly:${ctx.project.name}`,
      path: process.argv[1]
    })

    for (let fn of fns) {
      const serviceConfig = fn.events.service
      await this.start(serviceConfig, args, pm)
    }

    return pm.status(service)
  },

  start (serviceConfig, config, pm) {
    const service = serviceConfig.name
    const bind = config.bind || serviceConfig.bind
    const port = config.port || serviceConfig.port
    const cronRestart = config['cron-restart'] || serviceConfig.cronRestart
    const args = ['run', service]

    if (config.verbose) args.push('-v')
    else if (config.debug) args.push('-vv')

    return pm.start({
      name: service,
      args: ['run', service],
      cronRestart,
      env: {
        BIND: bind,
        PORT: port
      },
      instance: serviceConfig.singleton ? 1 : config.instance
    })
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
      '--port': Number,
      '--cron-restart': String
    },
    alias: {
      '--instance': '-i',
      '--bind': '-b',
      '--port': '-p'
    },
    descriptions: {
      _: `Start service as daemon`,
      '--instance': 'The instance number',
      '--bind': 'Bind address',
      '--port': 'Bind port',
      '--cron-restart': 'Schedule time to restart with cron pattern'
    }
  }
}
