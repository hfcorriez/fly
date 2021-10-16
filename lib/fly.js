const path = require('path')

const Validator = require('./validator')
const Loader = require('./loader')
const { FlyError } = require('./error')
const Context = require('./context')

const { FN_EXEC_BEFORE, FN_EXEC_AFTER, ucfirst, logger } = require('./utils')
const SYSTEM_EVENTS = ['startup', 'shutdown', 'error']

const info = logger('_fly', 'info')
const debug = logger('_fly', 'debug')
const error = logger('_fly', 'error')
const warn = logger('_fly', 'warn')

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
    if (!fn) throw new FlyError(`function not available: ${name}`)

    const eventType = initalContext && initalContext.eventType
    const chain = this.buildChain(fn, eventType)
    debug('build chain:', Object.keys(chain).join(' -> '))

    const ctx = Context.from(initalContext || {}, event, fn, this)

    try {
      for (let key of Object.keys(chain)) {
        if (key === 'catch') continue

        const [fnName, method] = chain[key]
        event = await this.invoke(fnName, method, event, ctx, eventType)
        ctx.emit(key, event)
        if (event && event.$end) {
          event = event.$end
          break
        }
      }
      info(`call <${fn.name}> success`)
    } catch (err) {
      if (!chain.catch) {
        error(`call <${fn.name}> failed`, err)
        this.emit('error', err)
        throw err
      }
      event = await this.invoke(chain.catch[0], chain.catch[1], err, ctx, eventType)
    }

    // if (ctx.originEventType) {
    //   ctx.eventType = ctx.originEventType
    //   ctx.originEventType = null
    // }

    // release ctx
    // ctx = undefined

    return event
  }

  async method (name, method, event, ctx) {
    if (!name) throw new FlyError('no name to call')
    if (!event) event = {}

    if (typeof event !== 'object') {
      throw new FlyError('illegal event: ' + JSON.stringify(event))
    }

    name = name.name || name
    let fn = this.loader.get(name, true)
    if (!fn) throw new FlyError(`function not available: ${name}`)
    if (!fn[method]) throw new FlyError(`method not available: ${name}:${method}`)

    return this.invoke(fn[method], fn, event, ctx, method)
  }

  /**
   * Call function without event match
   *
   * @param {String} fn    Function name
   * @param {Object} event
   * @param {Object} ctx
   * @returns {*}
   */
  invoke (name, method, event, ctx, eventType) {
    // debug('invoke:', `${name}:${method}`, eventType || '')
    const fn = this.loader.get(name)

    if (method.startsWith('props')) {
      Validator.validateEvent(event, fn[method])
      return event
    }

    ctx = Context.from(ctx, event, fn, this)

    const callee = eventType ? fn[method] : fn[method]

    const trace = {
      name: fn.name,
      startTime: Date.now(),
      invokeType: method,
      eventType,
      eventId: ctx.eventId
    }

    let ret
    try {
      ret = callee.call(fn, event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      const traceInfo = [
        `<${trace.name}>:${method}`,
        trace.error ? `| ${trace.error.stack.split('\n').shift()}` : ''
      ].join(' ')
      trace.error ? warn('invoke fail:', traceInfo) : debug('invoke success:', traceInfo)
    }

    if (trace.error) throw trace.error

    return ret
  }

  /**
   * Parse function chain
   *
   * @param {Object} fn
   * @param {Object} ctx
   */
  buildChain (fn, eventType) {
    if (fn.chain[eventType]) return fn.chain[eventType]

    debug('parse chain:', fn.name, eventType || '')
    const chain = {}
    const eventTypeCap = eventType && ucfirst(eventType)
    const config = this.loader.config(fn.prefix)
    const decorator = fn.decorator ? config.project.decorator && config.project.decorator[fn.decorator] : null

    const FNS_BEFORE = eventTypeCap ? FN_EXEC_BEFORE.map(f => f + eventTypeCap).concat(FN_EXEC_BEFORE) : FN_EXEC_BEFORE
    const FNS_AFTER = eventTypeCap ? FN_EXEC_AFTER.map(f => f + eventTypeCap).concat(FN_EXEC_AFTER) : FN_EXEC_AFTER

    const buildChain = (fn, key, value) => {
      if (!fn[key]) return

      if (typeof value === 'string' || Array.isArray(value)) {
        const chainFns = Array.isArray(value) ? value : [value]
        for (let chainFnName of chainFns) {
          const chainFn = this.loader.get(chainFnName, true)
          if (!chainFn) {
            throw new FlyError(`chain functon fail: ${chainFnName}`)
          }
          // parse before fn chain
          chain[`chain:${chainFnName}`] = [chainFnName, 'main', eventType]
          debug('add chain:', chainFnName, 'to', fn.name)
        }
      } else if (typeof value === 'function') {
        // chain[name] = chain[name] || [value, catchFn, fn, key]
        chain[key] = [ fn.name, key, eventType ]
        debug('add chain:', key, 'to', fn.name)
      } else {
        chain[key] = [ fn.name, key, eventType ]
      }
    }

    FNS_BEFORE.forEach(key => {
      if (decorator) buildChain(decorator, key, decorator[key])

      buildChain(fn, key, fn[key])
    })

    // [AFTER] function exec
    FNS_AFTER.forEach(key => {
      buildChain(fn, key, fn[key])

      if (decorator) buildChain(decorator, key, decorator[key])
      // info('add chain:', name, 'to', fn.name)
    })

    // Save catch fn to chain
    const catchName = `catch${eventTypeCap}`
    if (fn[catchName]) {
      chain.catch = [fn.name, catchName, eventType]
    } else if (decorator && decorator[catchName]) {
      chain.catch = [decorator[catchName], 'main', eventType]
    }

    fn.chain[eventType] = chain

    return chain
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
