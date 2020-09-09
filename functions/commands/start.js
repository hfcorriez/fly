const PM = require('../../lib/pm')
const colors = require('colors/safe')
const utils = require('../../lib/utils')

module.exports = {
  async main (event, ctx) {
    const { getService, project } = ctx
    const { args, params: { service } } = event
    const { config } = await getService({ service, args })
    const { bind, port, 'cron-restart': cronRestart } = config
    const commandArgs = ['run', service]

    if (config.verbose) commandArgs.push('-v')
    else if (config.debug) commandArgs.push('-vv')

    // Hot reload
    const pm = new PM({
      name: `fly:${project.name}`,
      path: process.argv[1]
    })

    await pm.start({
      name: service,
      args: commandArgs,
      cronRestart,
      env: {
        BIND: bind,
        PORT: port
      },
      instance: config.singleton ? 1 : config.instance
    })

    return pm.status(service)
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
