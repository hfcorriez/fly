const path = require('path')

const Validator = require('./validator')
const Loader = require('./loader')
const { FlyError } = require('./error')
const Context = require('./context')

const { FN_EXEC_BEFORE, FN_EXEC_AFTER, ucfirst, logger } = require('./utils')
const SYSTEM_EVENTS = ['startup', 'shutdown', 'error']

const info = logger('*fly', 'info')
const debug = logger('*fly', 'debug')
const error = logger('*fly', 'error')
const warn = logger('*fly', 'warn')

const DEFAULT_PROJECT_CONFIG = {
  env: process.env.NODE_ENV || 'development',
  ext: ['js', 'fly.js'],
  defaultIgnore: [
    'node_modules/**',
    'lib/**',
    'bin/**',
    'test/**',
    'tests/**',
    'config/**',
    'public/**',
    '*.test.js'
  ],
  dir: process.cwd(),
  name: process.cwd().split('/').pop(),
  hotreload: false,
  import: {},
  mounts: { $: path.join(__dirname, '../functions') }
}

class Fly {
  constructor (options) {
    if (typeof options === 'string') {
      options = { dir: options }
    } else if (!options) {
      options = {}
    }

    this.options = { ...DEFAULT_PROJECT_CONFIG, ...options }
    this.options.dir = path.resolve(this.options.dir)
    if (!this.options.name) {
      this.options.name = this.options.dir.split('/').pop()
    }

    if (typeof options.hotreload !== 'boolean' && this.options.env === 'development') {
      this.options.hotreload = true
    }

    this.options.ignore = this.options.defaultIgnore.concat(this.options.ignore || [])
    this.options.mounts[''] = this.options.dir

    this.loader = Loader.instance(this.options)
    // this.cache = Cache.instance(this)
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    info('bootstrap:', JSON.stringify({ dir: this.options.dir, name: this.options.name, env: this.options.env }))
    return this.loader.bootstrap()
  }

  /**
   * Get function
   *
   * @param {String} name
   */
  get (name, extend) {
    return this.loader.get(name, extend)
  }

  /**
   *  Exists function?
   * @param {String} name
   */
  exists (name) {
    return this.loader.exists(name)
  }

  /**
   * Import
   * @param {String} name
   */
  import (name) {
    return this.loader.import(name)
  }

  /**
   * Get functions by event type
   *
   * @param {String} type
   *  - @param {String} type Enum[project, mount, all(default)]
   * @returns {Array}
   */
  find (type, options) {
    return this.loader.find(type, options)
  }

  /**
   * Process function chains with event
   *
   * @param {String} fn
   * @param {Object} event
   */
  async call (name, event, initalContext) {
    if (!name) throw new FlyError('no name to call')
    if (!event) event = {}

    if (typeof event !== 'object') {
      throw new FlyError('illegal event: ' + JSON.stringify(event))
    }

    name = name.name || name
    let fn = this.loader.get(name, true)
    if (!fn) throw new FlyError(`no function to call: ${name}`)

    const ctx = initalContext || {}
    const chain = this.parse(fn, ctx)
    debug('build chain:', Object.keys(chain).join(' > '))

    for (let key of Object.keys(chain)) {
      const [calleeFn, catchFn, callee, invokeType] = chain[key]
      try {
        event = await this.invoke(calleeFn, callee, event, ctx, invokeType)
        if (event && event.$end) {
          event = event.$end
          break
        }
      } catch (err) {
        if (!catchFn) {
          error(`call failed: ${fn.name}`, err)
          this.emit('error', err)
          throw err
        }
        return this.invoke(catchFn, callee, err, ctx, invokeType)
      }
    }

    if (ctx.originEventType) {
      ctx.eventType = ctx.originEventType
      ctx.originEventType = null
    }

    return event
  }

  /**
   * Parse function chain
   *
   * @param {Object} fn
   * @param {Object} ctx
   */
  parse (fn, ctx) {
    const eventType = ctx.eventType || 'default'
    if (fn.chain[eventType]) return fn.chain[eventType]

    debug('parse chain:', fn.name, ctx.eventType || '')
    const chain = {}
    const eventTypeCap = eventType && ucfirst(eventType)
    const eventFn = ctx.eventType && fn.methods[ctx.eventType] ? fn.methods[ctx.eventType] : null
    const catchFn = (eventFn && eventFn.catch) || fn.catch

    const FNS_BEFORE = ['preload'].concat(eventTypeCap ? FN_EXEC_BEFORE.map(f => f + eventTypeCap).concat(FN_EXEC_BEFORE) : FN_EXEC_BEFORE)
    const FNS_AFTER = eventTypeCap ? FN_EXEC_AFTER.map(f => f + eventTypeCap).concat(FN_EXEC_AFTER) : FN_EXEC_AFTER

    FNS_BEFORE.forEach(key => {
      if (!fn[key]) return
      const name = `${fn.name}:${key}`
      const value = fn[key]

      if (key === 'props') {
        chain[name] = chain[name] || [(event) => Validator.validateEvent(event, fn.props), catchFn, fn, key]
      } else if (key === 'preload') {
        if (typeof value !== 'string' && !Array.isArray(value)) {
          throw new FlyError('preload must be using other functions name')
        }
        // info('preload:', fn.name, value)
        const preloadFns = Array.isArray(value) ? value : [value]
        for (let preloadFnName of preloadFns) {
          const preloadFn = this.loader.get(preloadFnName, true)
          if (!preloadFn) {
            throw new FlyError(`no functon ${preloadFnName} found`)
          }
          // info('preload chain:', preloadFnName)
          const preloadChain = this.parse(preloadFn, ctx)
          Object.keys(preloadChain).forEach(k => {
            if (chain[k]) return
            chain[k] = preloadChain[k]
            // info('add chain:', k, 'to', fn.name)
          })
        }
      } else if (typeof value === 'function') {
        chain[name] = chain[name] || [value, catchFn, fn, key]
        // info('add chain:', name, 'to', fn.name)
      } else {
        throw new FlyError(`illegal define ${fn.name}:${key}`)
      }
    })

    // [AFTER] function exec
    FNS_AFTER.forEach(key => {
      if (!fn[key]) return
      const name = `${fn.name}:${key}`
      chain[name] = chain[name] || [fn[key], catchFn, fn, key]
      // info('add chain:', name, 'to', fn.name)
    })

    fn.chain[eventType] = chain
    return chain
  }

  /**
   * Call function without event match
   *
   * @param {String} fn    Function name
   * @param {Object} event
   * @param {Object} ctx
   * @returns {*}
   */
  async invoke (callee, fn, event, ctx, invokeType) {
    debug('invoke:', `${fn.name}:${invokeType}`, ctx.eventType || '')
    ctx = Context.from(ctx, event, fn, this)

    const trace = {
      name: fn.name,
      startTime: Date.now(),
      invokeType,
      eventType: ctx.eventType,
      eventId: ctx.eventId
    }

    let ret
    try {
      ret = await callee.call(fn, event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      const traceInfo = [
        `${trace.eventType || '$'} ->`,
        `${trace.name}:${invokeType}`,
        trace.error ? `${trace.error.stack}` : ''
      ].join(' ')
      trace.error ? error('invoke fail:', traceInfo) : info('invoked:', traceInfo)
    }

    if (trace.error) throw trace.error

    return ret
  }

  /**
   * Emit event
   *
   * @param {String} type
   * @param {Object | Null} event
   * @param {Object | Null} ctx
   */
  emit (type, event, ctx) {
    if (!type) {
      warn(`no event type to emit`)
      return
    }
    if (!SYSTEM_EVENTS.includes(type)) {
      error(`event type do not support broadcast: ${type}`)
      return
    }

    return Promise.all(
      this.loader.find(type).map(fn => this.call(fn.name, event, ctx))
    )
  }
}

// debug = Fly.Logger('fly', 'debug', 'core')

module.exports = Fly
