const PM = require('../../lib/pm')
const colors = require('colors/safe')
const utils = require('../../lib/utils')

module.exports = {
  async main (event, ctx) {
    const { args, params: { service } } = event

    const fly = ctx.fly
    const fns = fly.list('service').filter(fn => service === 'all' ? Object.keys(ctx.service).includes(fn.name) : fn.events.service.name === service)

    // Hot reload
    const name = process.cwd().split('/').pop()
    const pm = new PM({
      name: `fly:${name}`,
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

    return pm.start({
      name: service,
      args: ['run', service],
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
