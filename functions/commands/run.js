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
    const { args, params: { service } } = event
    const fns = ctx.list('service')
      .filter(fn => service === 'all' ? Object.keys(ctx.service).includes(fn.name) : fn.events.service.name === service)

    if (!fns || !fns.length) {
      throw new Error(`service ${service} not found`)
    }

    for (let fn of fns) {
      await this.run(fn, args, ctx)
    }
    return { wait: true }
  },

  async run (fn, config, ctx) {
    const serviceConfig = fn ? fn.events.service : null
    const service = serviceConfig.name

    this.service = {
      name: ctx.project.name,
      type: service,
      pid: process.pid,
      env: ctx.project.env
    }

    // broadcast startup events
    await ctx.broadcast('startup', { service })
    ctx.info('starting...', { service })

    // handle debug event
    process.on('SIGUSR2', _ => this.startDebug(ctx))
    EXIT_SIGNALS.forEach(status => process.on(status, status => this.stopServer(status, ctx)))

    const [ret, err] = await ctx.call(fn, { ...serviceConfig, ...config }, { eventType: 'service' })
    if (err) throw err

    if (typeof ret === 'object') {
      Object.assign(this.service, ret)
    }

    console.log(colors.green(`[SERVICE] ${serviceConfig.title}`))
    Object.keys(this.service).forEach(key => {
      typeof this.service[key] !== 'object' && console.log(utils.padding(String(key.toUpperCase() + ': ').padStart(9)), this.service[key])
    })
  },

  catch (error) {
    console.log(colors.red(`SERVER ERROR`))
    console.log(utils.padding('MESSAGE:'.padStart(9)), colors.bold(error.message))
    console.log(utils.padding('STACK:'.padStart(9)), colors.bold(error.stack))
  },

  async stopServer (status, ctx) {
    try {
      if (this.isStopping) return
      this.isStopping = true
      await ctx.broadcast('shutdown', { service: this.service.type })
      ctx.info('SHUTDOWN', status)

      process.exit(0)
    } catch (err) {
      console.error(`shutdown with error: ${err.message} `)
      process.exit(1)
    }
  },

  startDebug (ctx) {
    ctx.info('debug start')
    debugStore.log = debug.log
    debugStore.names = debug.names

    ipc.config.id = `${this.service.name}-${process.pid}`
    ipc.config.logger = _ => {}
    ipc.config.stopRetrying = true

    ipc.connectTo('fly-debugger', _ => {
      ipc.of['fly-debugger'].on('connect', _ => ipc.of['fly-debugger'].emit('message', {
        type: 'service',
        service: this.service,
        id: ipc.config.id
      }))
      ipc.of['fly-debugger'].on('disconnect', _ => this.stopDebug(ctx))
      ipc.of['fly-debugger'].on('error', _ => {
        ipc.disconnect('fly-debugger')
        this.stopDebug(ctx)
      })
    })

    debug.log = (...args) => ipc.of['fly-debugger'] && ipc.of['fly-debugger'].emit('message', { type: 'log', log: args, id: ipc.config.id })
    debug.enable('*:*:*')
    this.isStoppingDebug = false
  },

  stopDebug (ctx) {
    if (this.isStoppingDebug) return
    this.isStoppingDebug = true
    debug.log = debugStore.log
    debug.enable(debugStore.names.map(toNamespace).join(','))
    debugStore.log = null
    debugStore.names = null
    ctx.info('debug stopped')
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
