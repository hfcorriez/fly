const PM = require('../../lib/pm')
const colors = require('colors/safe')
const utils = require('../../lib/utils')

module.exports = {
  async main (event, { fly, getServiceConfig }) {
    const { args, params: { service } } = event

    // Hot reload
    const pm = new PM({
      name: fly.project.name,
      path: process.argv[1]
    })

    if (service !== 'all') {
      await start(service)
    } else {
      for (const s in fly.service) {
        await start(s)
      }
    }

    return pm.status()

    async function start (s) {
      const { config } = await getServiceConfig({ service: s, args })
      const { bind, port, 'cron-restart': cronRestart, 'max-memory': maxMemory } = config
      const commandArgs = ['run', s]

      if (config.verbose) commandArgs.push('-v')
      else if (config.debug) commandArgs.push('-vv')

      await pm.start({
        name: s,
        args: commandArgs,
        cronRestart,
        maxMemory,
        env: {
          BIND: bind,
          PORT: port
        },
        instance: config.singleton ? 1 : config.instance,
        cluster: config.cluster
      })
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
      '--port': Number,
      '--cron-restart': String,
      '--max-memory': String
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
      '--cron-restart': 'Schedule time to restart with cron pattern',
      '--max-memory': 'Max memory(MB) to reload'
    }
  }
}
