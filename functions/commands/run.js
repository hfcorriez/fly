const colors = require('colors/safe')
const debug = require('debug')
const ipc = require('node-ipc')
const utils = require('../../lib/utils')
const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT']
const debugStore = {
  names: null,
  log: null
}

module.exports = {
  async main (event, ctx) {
    const { getServiceConfig } = ctx
    const { args, params: { service } } = event
    const { config, fn } = await getServiceConfig({ service, args })

    await this.run(fn, config, ctx)

    return { wait: true }
  },

  async run (fn, config, ctx) {
    const { fly } = ctx
    const fnConfig = fn ? fn.events.service : null
    const service = config.service

    this.service = {
      project: fly.project.name,
      type: service,
      pid: process.pid,
      env: fly.project.env
    }

    // broadcast startup events
    await fly.emit('startup', { service })
    fly.debug('starting...', { service })

    // handle debug event
    process.on('SIGUSR2', _ => this.startDebug(fly))
    EXIT_SIGNALS.forEach(status => process.on(status, status => this.stopServer(status, fly)))

    const [ret, err] = await fly.call(fn, { ...fnConfig, ...config }, { eventType: 'service', ...config.context }, true)
    if (err) throw err

    if (typeof ret === 'object') {
      Object.assign(this.service, ret)
    }

    console.log(colors.green(`[SERVICE] ${fnConfig.name}`))
    Object.keys(this.service).forEach(key => {
      typeof this.service[key] !== 'object' && console.log(utils.padding(String(key.toUpperCase() + ': ').padStart(9)), this.service[key])
    })
  },

  catch (error) {
    console.log(colors.red(`SERVER ERROR`))
    console.log(utils.padding('MESSAGE:'.padStart(9)), colors.bold(error.message))
    console.log(utils.padding('STACK:'.padStart(9)), colors.bold(error.stack))
  },

  async stopServer (status, fly) {
    try {
      if (this.isStopping) return
      this.isStopping = true
      await fly.emit('shutdown', { service: this.service.type })
      fly.info('shutdown: ', status)

      process.exit(0)
    } catch (err) {
      console.error(`shutdown with error: ${err.message} `)
      process.exit(1)
    }
  },

  startDebug (fly) {
    fly.debug('debug start')
    debugStore.log = debug.log
    debugStore.names = debug.names

    ipc.config.id = `${this.service.project}-${process.pid}`
    ipc.config.logger = _ => {}
    ipc.config.stopRetrying = true

    ipc.connectTo('fly-debugger', _ => {
      ipc.of['fly-debugger'].on('connect', _ => ipc.of['fly-debugger'].emit('message', {
        type: 'service',
        service: this.service,
        id: ipc.config.id
      }))
      ipc.of['fly-debugger'].on('disconnect', _ => this.stopDebug(fly))
      ipc.of['fly-debugger'].on('error', _ => {
        ipc.disconnect('fly-debugger')
        this.stopDebug(fly)
      })
    })

    debug.log = (...args) => ipc.of['fly-debugger'] && ipc.of['fly-debugger'].emit('message', { type: 'log', log: args, id: ipc.config.id })
    debug.enable('<*:*>*')
    this.isStoppingDebug = false
  },

  stopDebug (fly) {
    if (this.isStoppingDebug) return
    this.isStoppingDebug = true
    debug.log = debugStore.log
    debug.enable(debugStore.names.map(toNamespace).join(','))
    debugStore.log = null
    debugStore.names = null
    fly.debug('debug stopped')
  },

  configCommand: {
    _: `run [service]`,
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
      _: `Run service in foregroud`,
      '--instance': 'The instance number',
      '--bind': 'Bind address',
      '--port': 'Bind port'
    }
  }
}

function toNamespace (regexp) {
  return regexp.toString()
    .substring(2, regexp.toString().length - 2)
    .replace(/\.\*\?/g, '*')
}
