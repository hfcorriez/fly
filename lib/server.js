const debug = require('debug')('fly/server')
const PM = require('./pm')
const colors = require('colors/safe')
const utils = require('../lib/utils')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  async before (event) {
    this.init && this.init(event)

    if (this.fly) {
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
    }

    return event
  },

  run () {
    throw new Error('need to implements')
  },

  async main (event, ctx) {
    if (!event.params.command) {
      if (event.args.port) this.config.port = event.args.port
      if (event.args.bind) this.config.address = event.args.bind
      let ret = await this.run(event.params, ctx)
      return ret
    }

    let name = process.cwd().split('/').pop()
    const pm = new PM({
      name: `fly:${this.config.name.toLowerCase()}`,
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
        await pm.start({
          name,
          args: [this.config.command],
          instance: event.args.instance,
          env: {
            PORT: event.args.port || this.config.port
          }
        })
        await pm.status(names)
        break
    }
  },

  catch (error) {
    console.log(colors.bgRed(`SERVER ERROR`))
    console.log(utils.padding('  MESSAGE:', 12), colors.bold(error.message))
    console.log(utils.padding('  STACK:', 12), colors.bold(error.stack))
  },

  after (event) {
    if (event) {
      console.log(colors.bgGreen(`SERVER READY`))
      console.log(utils.padding('  NAME:', 12), colors.bold(this.config.name))
      console.log(utils.padding('  ADDRESS:', 12), colors.bold(event.address))
      console.log(utils.padding('  PID:', 12), colors.bold(process.pid))
      console.log(utils.padding('  WORK DIR:', 12), colors.bold(process.cwd()))
      return
    }
    process.exit(0)
  },

  configCommand () {
    if (!this.config || !this.config.command) return false

    return {
      _: `${this.config.command} [command]`,
      args: {
        '--port': Number,
        '--instance': Number,
        '--all': Boolean,
        '--bind': String
      },
      alias: {
        '--port': '-p',
        '--bind': '-b',
        '--foreground': '-f',
        '--instance': '-i',
        '--all': '-a'
      },
      descriptions: {
        _: `${this.config.name || this.config.command} service`,
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
