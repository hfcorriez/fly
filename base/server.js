const debug = require('debug')('fly/server')
const fs = require('fs')
const path = require('path')
const PM = require('../lib/pm')
const colors = require('colors/safe')
const utils = require('../lib/utils')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  watched: {},

  async before (event) {
    this.init && this.init(event)

    if (this.fly) {
      // Hot reload
      if (event.args.hotreload) {
        fs.watch(this.fly.options.dir, { recursive: true }, (_, file, file2) => {
          const filePath = path.join(this.fly.options.dir, file)
          let ret
          if (fs.existsSync(filePath)) {
            ret = this.fly.reload(filePath)
          } else {
            ret = this.fly.delete(filePath)
          }
          ret && console.debug(colors.yellow('HOT_RELOAD'), colors.grey(file))
        })
      }

      await this.fly.broadcast('startup')
      debug('STARTUP...')

      let stop = false
      EXIT_SIGNALS.forEach(status => process.on(status, async () => {
        try {
          if (stop) return
          stop = true
          await this.fly.broadcast('shutdown')
          debug('SHUTDOWN')
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
      let result = await this.run(event.params, ctx)
      return { args: event.args, result }
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
    if (!event) return

    console.log(colors.bgGreen(`SERVER READY`))
    console.log(utils.padding('  NAME:', 12), colors.bold(this.config.name))
    event.result && event.result.address && console.log(utils.padding('  ADDRESS:', 12), colors.bold(event.result.address))
    console.log(utils.padding('  PID:', 12), colors.bold(process.pid))
    console.log(utils.padding('  WORK DIR:', 12), colors.bold(process.cwd()))
    console.log(utils.padding('  HOT RELOAD:', 12), colors.bold(event.args.hotreload || 'false'))

    return { wait: true }
  },

  configCommand () {
    if (!this.config || !this.config.command) return false

    return {
      _: `${this.config.command} [command]`,
      args: {
        '--port': Number,
        '--instance': Number,
        '--all': Boolean,
        '--bind': String,
        '--hotreload': Boolean
      },
      alias: {
        '--port': '-p',
        '--bind': '-b',
        '--instance': '-i',
        '--all': '-a',
        '--hotreload': '-r'
      },
      descriptions: {
        _: `${this.config.name || this.config.command} service`,
        '[command]': 'start | stop | reload | restart | status | log',
        '--port': 'Bind port',
        '--host': 'Bind host',
        '--instance': 'The instance number',
        '--all': 'All applications',
        '--hotreload': 'Run with hot reload mode'
      }
    }
  }
}
