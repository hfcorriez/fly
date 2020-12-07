const path = require('path')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const micromatch = require('micromatch')
const colors = require('colors/safe')
const Debug = require('debug')
const chokidar = require('chokidar')
const callerId = require('caller-id')

const Validator = require('./validator')
const Loader = require('./loader')
const { FlyError } = require('./error')
const Cache = require('./cache')

const DEBUG_COLORS = { fatal: 1, error: 9, warn: 3, info: 4, debug: 8 }
const { FN_EXEC_BEFORE, FN_EXEC_AFTER, ucfirst, padding } = require('./utils')

let debug

const DEFAULT_PROJECT_CONFIG = {
  env: process.env.NODE_ENV || 'development',
  ext: ['js', 'fly.js'],
  dirs: null,
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
  systemEvents: ['startup', 'shutdown', 'error'],
  dir: process.cwd(),
  name: process.cwd().split('/').pop(),
  hotreload: false,
  import: {},
  mounts: { $: path.join(__dirname, '../functions') }
}

class Fly {
  constructor (config) {
    this.files = {}
    this.functions = {}
    this.extends = {}
    // this.mounts = {}
    this.imports = {}
    this.ctxCache = {}

    if (typeof config === 'string') {
      config = { dir: config }
    } else if (!config) {
      config = {}
    }

    this.config = { ...DEFAULT_PROJECT_CONFIG, ...config }
    this.config.dir = path.resolve(this.config.dir)
    if (!this.config.name) {
      this.config.name = this.config.dir.split('/').pop()
    }

    if (typeof config.hotreload !== 'boolean' && this.config.env === 'development') {
      this.config.hotreload = true
    }

    this.config.ignore = this.config.defaultIgnore.concat(this.config.ignore || [])
    this.config.mounts[''] = this.config.dir

    this.loader = Loader.instance(this.config)
    this.cache = Cache.instance(this.config)

    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Process mounts
    // Object.keys(this.config.mounts).forEach(key => {
    //   if (!this.mounts[key]) this.mounts[key] = []
    //   const dir = this.config.mounts[key]
    //   this.mounts[key].push(dir)
    // })

    // Inject the main service
    // debug('bootstrap:', JSON.stringify({ dir: this.config.dir, name: this.config.name, env: this.config.env }))

    // this.loadConfig()
    this.cache.compile()
    this.caches = this.cache.all()

    // Only mount root with fly.yml
    // if (flyConfig) {
    //   this.mount(this.config.dir)
    // }

    // // Mount all dirs
    // Object.keys(this.mounts).forEach(prefix => {
    //   this.mounts[prefix].forEach(dir => this.mount(dir, prefix))
    // })
  }

  /**
   * Import
   *
   * @param {String} file
   */
  import (file, force) {
    file = require.resolve(file)
    if (this.imports[file] && !force) return this.imports[file]

    debug('import:', file)
    delete require.cache[file]
    this.imports[file] = require(file)
    return this.imports[file]
  }

  /**
   * Get function from
   *
   * - function
   * - module@function
   *
   * @param {String} name
   */
  get (name) {
    if (!name) throw new FlyError('no name given')
    if (name[0] === '/') {
      return this.files[name]
    }
    if (this.functions[name]) {
      return this.functions[name]
    }
    if (!this.functions[name] && this.caches[name]) {
      const { file, root, prefix } = this.caches[name]
      const fn = this.load(file, { root, prefix })
      this.extend(fn.name)
      return fn
    }
    return false
  }

  /**
   * Exists function
   *
   * @param {String} name
   */
  exists (name) {
    return !!(this.functions[name] || this.caches[name])
  }

  /**
 *
 * @param {String} fn
 */
  set (name, event, config) {
    const fn = this.get(name)
    if (!fn) return false
    if (!fn.events[event]) fn.events[event] = {}
    Object.assign(fn.events[event], config)
    debug('config overwrite:', name, event, config)
    return true
  }

  /**
   * Load function describer
   *
   * @param {String} file
   * @param {Object} flyConfig
   */
  load (file, options) {
    const fn = this.loader.load(file, options)
    if (!fn) {
      throw new FlyError(`not fly function: ${file}`)
    }
    this.files[file] = fn
    this.functions[fn.name] = fn
    return fn
  }

  /**
   * Reload
   *
   * @param {String} file
   */
  reload (name) {
    let fn = this.functions[name]
    if (!fn) return false

    fn = this.load(fn.file, { force: true, prefix: fn.prefix, root: fn.root })
    if (!fn) return false

    debug('reload fn:', name)
    if (this.extends[fn.name]) this.extends[name].forEach(n => this.reload(n))
    return true
  }

  /**
   * Delete
   *
   * @param {String} name
   */
  delete (name) {
    const fn = this.functions[name]
    if (!fn) return false
    debug('delete fn:', name)
    delete this.files[fn.file]
    delete this.functions[name]
    if (fn.extends && this.extends[fn.extends]) {
      this.extends[fn.extends].splice(this.extends[fn.extends].indexOf(name), 1)
    }
    delete require.cache[fn.file]
    return true
  }

  /**
   *
   * @param {String} dir
   */
  prepare (dir, prefix) {
    debug('perpare:', dir, prefix)

    // Process extends
    Object.keys(this.functions).forEach(name => {
      if (prefix && !name.startsWith(prefix)) return
      if (!this.functions[name].extends) return
      this.extend(name)
    })

    if (this.config.hotreload && !this.isWatching) {
      this.isWatching = true
      debug('hotreload watch:', dir)
      chokidar.watch(dir, { ignoreInitial: true, ignored: /(^|[/\\])\../ }).on('all', (event, file) => {
        debug('hotreload event:', event, file)
        if (event === 'add' && this.files[file]) event = 'change'
        const filename = file.split('/').pop()
        switch (event) {
          case 'change':
            if (this.imports[file]) {
              this.import(file, true)
            } else if (this.files[file]) {
              this.reload(this.files[file].name)
            } else if (filename.startsWith('fly.') && filename.endsWith('.yml')) {
              // this.loadConfig()
              this.prepare(dir, prefix)
            }
            break
          case 'unlink':
            if (this.files[file]) {
              this.delete(this.files[file].name)
            }
            break
          case 'add':
            this.load(file)
            break
        }
      })
    }
  }

  /**
   * Extend function from other
   *
   * @param {String} name
   * @param {String} fromName
   */
  extend (name, force) {
    debug('extend', name, force)
    const fn = this.get(name)
    if (!fn) return false
    const from = fn.extends

    debug('extend check', colors.bold(name))
    if (force && this.extends[from] && this.extends[from].includes(name)) {
      this.extends[from].splice(this.extends[from].indexOf(name), 1)
      debug('extend force')
    }

    if (!from || (this.extends[from] && this.extends[from].includes(name))) {
      debug('extend already exists')
      return
    }

    const fromFn = this.get(from)
    if (!fromFn) {
      debug(`extends not found: ${from}`)
      return
    }

    if (fromFn.extends) {
      debug('parent extend', fromFn.name, fromFn.extends)
      this.extend(fromFn.name)
    }

    const extendKeys = []
    Object.keys(fromFn).forEach(key => {
      if (fn[key] || typeof fromFn[key] !== 'function') return
      extendKeys.push(key)
      fn[key] = fromFn[key]
    })
    debug(`extend ${colors.bold(name)} from ${colors.bold(from)}`)
    // this.parseEvents(fn)
    this.extends[from] = this.extends[from] || []
    this.extends[from].includes(name) || this.extends[from].push(name)
  }

  /**
   * Get functions by event type
   *
   * @param {String} type
   * @param {Object} options
   *  - @param {String} type Enum[project, mount, all(default)]
   *  - @param {String} mount Array[string]
   * @returns {Array}
   */
  list (type, options) {
    options = typeof type === 'object' ? type : options || {}
    const functions = []
    Object.keys(this.caches).forEach(name => {
      const fnCache = this.caches[name]
      if (type && !fnCache.events[type]) return
      if (options.type === 'project' && fnCache.prefix) return
      !functions.includes(fnCache) && functions.push(fnCache)
    })
    return functions
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

    let fn = name.events ? name : this.get(name)
    if (!fn) throw new FlyError(`no function to call: ${name}`)

    const ctx = initalContext || {}
    const chain = this.parseChain(fn, ctx)
    const keys = Object.keys(chain)
    debug('build chain:', keys.join(' > '))

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
          this.broadcast('error', err)
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
  parseChain (fn, ctx) {
    debug('parse chain', fn.name, ctx.eventType)
    const chain = {}

    const eventType = ctx.eventType || 'default'
    if (fn.chain[eventType]) return fn.chain[eventType]

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
        debug('preload:', fn.name, value)
        const preloadFns = Array.isArray(value) ? value : [value]
        for (let preloadFnName of preloadFns) {
          const preloadFn = this.get(preloadFnName)
          if (!preloadFn) {
            throw new FlyError(`no functon ${preloadFnName} found`)
          }
          debug('preload chain:', preloadFnName)
          const preloadChain = this.parseChain(preloadFn, ctx)
          Object.keys(preloadChain).forEach(k => {
            if (chain[k]) return
            chain[k] = preloadChain[k]
            debug('add chain:', k, 'to', fn.name)
          })
        }
      } else if (typeof value === 'function') {
        chain[name] = chain[name] || [value, catchFn, fn, key]
        debug('add chain:', name, 'to', fn.name)
      } else {
        throw new FlyError(`illegal define ${fn.name}:${key}`)
      }
    })

    // [AFTER] function exec
    FNS_AFTER.forEach(key => {
      if (!fn[key]) return
      const name = `${fn.name}:${key}`
      chain[name] = chain[name] || [fn[key], catchFn, fn, key]
      debug('add chain:', name, 'to', fn.name)
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
    debug('invoke start:', colors.bold(`${fn.name}:${invokeType}`), event)
    ctx = this.getCtx(ctx, event, fn)

    const trace = {
      name: fn.name,
      startTime: Date.now(),
      invokeType,
      eventType: ctx.eventType,
      eventId: ctx.eventId
    }
    ctx.leftRetries = ctx.leftRetries || ctx.retry || 1

    let ret
    try {
      ret = await callee.call(fn, event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      const traceInfo = [
        colors.bold(`(${trace.eventType || '-'}) ${trace.name}:${invokeType}`),
        trace.spendTime + 'ms',
        trace.error ? `[${trace.error.name}] ${trace.error.stack}` : 'OK',
        colors.grey(trace.eventId.split('-').pop() || '-')
      ].join(' ')
      debug(trace.error ? 'invoke fail:' : 'invoke ok:', traceInfo)
    }

    if (trace.error) {
      --ctx.leftRetries
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        debug('retry failed after', ctx.retry, 'times')
        ret = this.invoke(callee, fn, event, ctx)
      }
    }

    return ret
  }

  /**
   *
   * @param {String} type
   * @param {Object | Null} event
   * @param {Object | Null} ctx
   */
  broadcast (type, event, ctx) {
    if (!type) throw new FlyError('event type is requried')
    if (!this.config.systemEvents.includes(type)) { throw new FlyError('event type is do not support broadcast') }
    return Promise.all(
      this.list(type).map(fn => this.call(fn, event, ctx).catch(err =>
        debug(`broadcast error: ${fn.name} ${err.message}`)
      ))
    )
  }

  /**
   * @param {Function} callee
   */
  buildCaller (callee) {
    const self = this

    function func (...args) {
      const caller = callerId.getData(func)
      const fn = self.files[caller.filePath]
      return callee({ fn, caller, args })
    }

    return func
  }

  /**
   * Build logger
   *
   * @param {String} level
   * @param {Object} ctx
   */
  buildLogger (level, ctx) {
    return this.buildCaller(({ fn, args }) =>
      Fly.Logger(this.config.name, level, fn.name)(...args, colors.grey(`(${ctx.eventId})`))
    )
  }

  /**
   * Create context for function
   *
   * @param {Object} ctx
   */
  getCtx (ctx, event, fn) {
    ctx = ctx || {}
    // ctx = CONTEXT_KEYS.map(key => ({ [key]: ctx[key] })).reduce((res, o) => ({ ...res, ...o }), {})

    if (!ctx.eventId) ctx.eventId = uuidv4().split('-').pop()

    // Event only exists in invoke
    if (!ctx.hasOwnProperty('originalEvent')) ctx.originalEvent = event
    else ctx.parentEvent = event

    // if (!ctx.traces) ctx.traces = []

    // Trace
    // ctx.trace = {
    //   name: ctx.name,
    //   invokeType: ctx.invokeType || '',
    //   startTime: Date.now(),
    //   eventType: ctx.eventType,
    //   eventId: ctx.eventId
    // }
    // if (!ctx.traces.includes(ctx.trace)) ctx.traces.push(ctx.trace)

    if (!ctx.fly) {
      debug('init ctx.fly')
      ctx.fly = {
        list: this.list.bind(this),
        get: this.get.bind(this),
        broadcast: this.broadcast.bind(this),
        end: data => ({ $end: data }),
        call: this.buildCaller(({ fn, args: [ name, evt, context, isolation ] }) => {
          isolation = isolation || context === true
          if (isolation) {
            context = context === true ? {} : context
          } else {
            context = Object.assign(ctx, {
              originEventType: ctx.eventType,
              eventType: null,
              ...context
            })
          }
          const fnName = typeof name === 'object' ? name : (this.exists(name) ? name : fn.prefix + name)
          return this.call(fnName, evt, context)
            .then(result => [result, null])
            .catch(err => [null, err])
        }),
        super: this.buildCaller(({ fn, caller, event }) => {
          if (!caller.functionName || !fn[caller.functionName]) return event
          return this.invoke(fn[caller.functionName], fn, event, ctx, caller.functionName)
        }),
        debug: this.buildLogger('debug', ctx),
        info: this.buildLogger('info', ctx),
        warn: this.buildLogger('warn', ctx),
        error: this.buildLogger('error', ctx),
        fatal: this.buildLogger('fatal', ctx)
      }
    }

    // if (fresh) {
    //   debug('clean ctx:', fn.prefix)
    //   /**
    //    * Clear context keys if its not fresh, to avoid context pollution. Only keep reversed context keys
    //    */
    //   Object.keys(ctx).forEach(key => {
    //     if (CTX_RESERVED_KEYS.includes(key)) return
    //     delete ctx[key]
    //   })
    // }

    /**
     * Process function imports
     */
    // Object.keys(this.functions).forEach(key => {
    //   console.log('key', key)
    //   if (fn.prefix && !key.startsWith(fn.prefix)) return
    //   ctx[key.substr(fn.prefix.length)] = (evt, context) => this.call(key, evt, Object.assign(ctx, {
    //     originEventType: ctx.eventType,
    //     eventType: null,
    //     ...context
    //   }))
    // })

    Object.keys(this.caches).forEach(key => {
      if (fn.prefix && !key.startsWith(fn.prefix)) return
      ctx[key.substr(fn.prefix.length)] = (evt, context) => {
        return this.call(key, evt, Object.assign(ctx, {
          originEventType: ctx.eventType,
          eventType: null,
          ...context
        }))
      }
    })

    Object.assign(ctx, this.getCtxCache(fn.prefix))

    return ctx
  }

  /**
   * Get ctx cache
   *
   * @param {String} prefix
   */
  getCtxCache (prefix) {
    let ctxCache = this.ctxCache[prefix]
    if (!ctxCache) {
      debug('init ctx for:', prefix)

      const config = this.loader.config()
      // Apply fly.yml config to ctx
      ctxCache = {}
      Object.keys(config).forEach(key => {
        if (!ctxCache[key]) ctxCache[key] = config[key]
      })

      /**
      * Process imports
      */
      Object.keys(config.project.import).forEach(key => {
        debug('import', key, config.project.import[key])
        const filePath = path.join(config.project.dir, config.project.import[key])
        ctxCache[key] = this.import(filePath)
      })

      this.ctxCache[prefix] = ctxCache
    }

    return ctxCache
  }

  /**
   * Get logger
   *
   * @param {String} namespace
   * @param {String} level
   * @param {String} program
   */
  static Logger (namespace, level, program) {
    const color = DEBUG_COLORS[level]
    const logger = Debug(`${namespace}:${level}:${program}`)
    logger.color = color || 6
    return logger
  }
}

debug = Fly.Logger('fly', 'debug', 'core')

module.exports = Fly
