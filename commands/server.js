const debug = require('debug')('fly/server')
const fs = require('fs')
const path = require('path')
const PM = require('../lib/pm')
const colors = require('colors/safe')
const utils = require('../lib/utils')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'SIGUSR1', 'SIGUSR2']

module.exports = {
  watched: {},

  config: {
    command: 'server',
    name: 'server',
    port: 0,
    address: '127.0.0.1'
  },

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
          debug('SHUTDOWN', status)

          process.exit(0)
        } catch (err) {
          console.error(`shutdown with error: ${err.message} `)
          process.exit(1)
        }
      }))
    }

    return event
  },

  async run () {
    const pm = new PM({
      name: `fly`,
      path: process.argv[1]
    })
    await pm.status('all')
    return false
  },

  async main (event, ctx) {
    if (!event.params.command) {
      if (event.args.port) this.config.port = event.args.port
      if (event.args.bind) this.config.address = event.args.bind
      let result = await this.run(event.params, ctx)
      if (result === false) return
      return { args: event.args, result }
    }

    const name = process.cwd().split('/').pop()
    const app = !event.args.all && name
    const pm = new PM({
      name: `fly:${this.config.name.toLowerCase()}`,
      path: process.argv[1]
    })

    switch (event.params.command) {
      case 'list':
      case 'status':
        await pm.status(app)
        break
      case 'log':
        await pm.log(app)
        break
      case 'end':
      case 'stop':
        await pm.stop(app)
        await pm.status(app)
        break
      case 'restart':
        await pm.restart(app)
        await pm.status(app)
        break
      case 'reload':
        await pm.reload(app)
        await pm.status(app)
        break
      case 'start':
        await pm.start({
          name,
          args: [this.config.command],
          instance: this.config.singleton ? 1 : event.args.instance,
          env: {
            PORT: event.args.port || this.config.port
          }
        })
        await pm.status(app)
        break
    }
  },

  catch (error) {
    console.log(colors.red(`SERVER ERROR`))
    console.log(utils.padding('  MESSAGE:', 12), colors.bold(error.message))
    console.log(utils.padding('  STACK:', 12), colors.bold(error.stack))
  },

  after (event) {
    if (!event) return

    console.log(colors.green(`SERVER READY`))
    console.log(utils.padding('  NAME:', 12), colors.bold(this.config.name))
    event.result && event.result.address && console.log(utils.padding('  ADDRESS:', 12), colors.bold(event.result.address))
    console.log(utils.padding('  PID:', 12), colors.bold(process.pid))
    console.log(utils.padding('  WORK DIR:', 12), colors.bold(process.cwd()))
    console.log(utils.padding('  HOT RELOAD:', 12), colors.bold(event.args.hotreload || 'false'))

    return { wait: true }
  },

  configCommand () {
    if (!this.config || !this.config.command) return false

    if (this.config.command === 'server') {
      return {
        _: 'server',
        descriptions: {
          _: 'Show servers'
        }
      }
    }

    const args = {
      '--all': Boolean,
      '--hotreload': Boolean
    }

    const alias = {
      '--all': '-a',
      '--hotreload': '-r'
    }

    const descriptions = {
      _: `${this.config.name || this.config.command} service`,
      '[command]': 'start | stop | reload | restart | status | log',
      '--all': 'All applications',
      '--hotreload': 'Run with hot reload mode'
    }

    if (!this.config.singleton) {
      args['--instance'] = Number
      alias['--instance'] = '-i'
      descriptions['--instance'] = 'The instance number'
    }

    if (this.config.port) {
      args['--bind'] = String
      args['--port'] = Number
      alias['--bind'] = '-b'
      alias['--port'] = '-p'
      descriptions['--bind'] = 'Bind address'
      descriptions['--port'] = 'Bind port'
    }

    return {
      _: `${this.config.command} [command]`,
      args,
      alias,
      descriptions
    }
  }
}
