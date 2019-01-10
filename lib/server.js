const debug = require('debug')('fly/server')
const PM = require('./pm')
const Fly = require('./fly')
const colors = require('colors/safe')
const utils = require('../lib/utils')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  before: async function (event) {
    this.fly = new Fly()
    await this.fly.broadcast('startup')
    debug('startup...')

    let stop = false
    EXIT_SIGNALS.forEach(status => process.on(status, async () => {
      try {
        if (stop) return
        stop = true
        await this.fly.broadcast('shutdown')
        debug('shutdown')
        process.exit(0)
      } catch (err) {
        console.error(`shutdown with error: ${err.message} `)
        process.exit(1)
      }
    }))

    return event
  },

  run: function (event) {
    throw new Error('need to implements')
  },

  main: async function (event, ctx) {
    if (event.args.foreground) {
      let ret = await this.run(event.args, ctx)
      return ret
    }

    let name = process.cwd().split('/').pop()
    const pm = new PM({
      name: `fly:${this.server.name.toLowerCase()}`,
      path: process.argv[1]
    })

    let names = !event.args.all && name
    switch (event.params.command) {
      case 'list':
      case 'status':
        await pm.status(names)
        break
      case 'log':
        await pm.log(names)
        break
      case 'end':
      case 'stop':
        await pm.stop(names)
        await pm.status(names)
        break
      case 'restart':
        await pm.restart(names)
        await pm.status(names)
        break
      case 'reload':
        await pm.reload(names)
        await pm.status(names)
        break
      case 'start':
      case undefined:
        await pm.start({
          name,
          args: ['up', '-f'],
          instance: event.args.instance,
          env: {
            PORT: event.args.port || null
          }
        })
        await pm.status(name)
        break
    }
  },

  after: function (event) {
    if (event) {
      console.log(colors.bgGreen(`${this.server.name} SERVICE READY`))
      console.log(utils.padding('  NAME:', 12), colors.bold(this.server.name))
      console.log(utils.padding('  ADDRESS:', 12), colors.bold(event.address))
      console.log(utils.padding('  PID:', 12), colors.bold(process.pid))
      console.log(utils.padding('  WORK DIR:', 12), colors.bold(process.cwd()))
      return
    }
    process.exit(0)
  },

  configCommand: function () {
    if (!this.server || !this.server.command) return false

    return {
      _: `${this.server.command} [command]`,
      args: {
        '--port': Number,
        '--foreground': Boolean,
        '--instance': Number,
        '--all': Boolean
      },
      alias: {
        '--port': '-p',
        '--foreground': '-f',
        '--instance': '-i',
        '--all': '-a'
      },
      descriptions: {
        _: `${this.server.name || this.server.command} service`,
        '[command]': 'start | stop | reload | restart | status | log',
        '--port': 'Bind port',
        '--host': 'Bind host',
        '--foreground': 'Run in foreground',
        '--instance': 'The instance number',
        '--all': 'All applications'
      }
    }
  }
}
