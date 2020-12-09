const path = require('path')
const chokidar = require('chokidar')

const Validator = require('./validator')
const Loader = require('./loader')
const { FlyError } = require('./error')
const Cache = require('./cache')
const Context = require('./context')

const { FN_EXEC_BEFORE, FN_EXEC_AFTER, ucfirst } = require('./utils')

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
  constructor (options) {
    this.files = {}
    this.functions = {}
    // this.extends = {}
    // this.mounts = {}
    this.imports = {}
    this.ctxCache = {}

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

    this.loader = Loader.instance(this)
    this.cache = Cache.instance(this)

    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Process mounts
    // Object.keys(this.options.mounts).forEach(key => {
    //   if (!this.mounts[key]) this.mounts[key] = []
    //   const dir = this.options.mounts[key]
    //   this.mounts[key].push(dir)
    // })

    // Inject the main service
    // debug('bootstrap:', JSON.stringify({ dir: this.options.dir, name: this.options.name, env: this.options.env }))

    // this.loadConfig()
    this.cache.compile()
    this.caches = this.cache.all()
    this.config = this.loader.config()

    // Only mount root with fly.yml
    // if (flyConfig) {
    //   this.mount(this.options.dir)
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
    if (this.options.import[file]) {
      file = path.join(this.options.dir, this.options.import[file])
    } else {
      file = require.resolve(file)
    }
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
      return this.load(file, { root, prefix })
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
    // debug('config overwrite:', name, event, config)
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

    // debug('reload fn:', name)
    // if (this.extends[fn.name]) this.extends[name].forEach(n => this.reload(n))
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
    // debug('delete fn:', name)
    delete this.files[fn.file]
    delete this.functions[name]
    // if (fn.extends && this.extends[fn.extends]) {
    //   this.extends[fn.extends].splice(this.extends[fn.extends].indexOf(name), 1)
    // }
    delete require.cache[fn.file]
    return true
  }

  /**
   *
   * @param {String} dir
   */
  prepare (dir, prefix) {
    // debug('perpare:', dir, prefix)

    // Process extends
    // Object.keys(this.functions).forEach(name => {
    //   if (prefix && !name.startsWith(prefix)) return
    //   if (!this.functions[name].extends) return
    //   this.extend(name)
    // })

    if (this.options.hotreload && !this.isWatching) {
      this.isWatching = true
      // debug('hotreload watch:', dir)
      chokidar.watch(dir, { ignoreInitial: true, ignored: /(^|[/\\])\../ }).on('all', (event, file) => {
        // debug('hotreload event:', event, file)
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
    // const keys = Object.keys(chain)
    // debug('build chain:', keys.join(' > '))

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
    // debug('parse chain', fn.name, ctx.eventType)
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
        // debug('preload:', fn.name, value)
        const preloadFns = Array.isArray(value) ? value : [value]
        for (let preloadFnName of preloadFns) {
          const preloadFn = this.get(preloadFnName)
          if (!preloadFn) {
            throw new FlyError(`no functon ${preloadFnName} found`)
          }
          // debug('preload chain:', preloadFnName)
          const preloadChain = this.parseChain(preloadFn, ctx)
          Object.keys(preloadChain).forEach(k => {
            if (chain[k]) return
            chain[k] = preloadChain[k]
            // debug('add chain:', k, 'to', fn.name)
          })
        }
      } else if (typeof value === 'function') {
        chain[name] = chain[name] || [value, catchFn, fn, key]
        // debug('add chain:', name, 'to', fn.name)
      } else {
        throw new FlyError(`illegal define ${fn.name}:${key}`)
      }
    })

    // [AFTER] function exec
    FNS_AFTER.forEach(key => {
      if (!fn[key]) return
      const name = `${fn.name}:${key}`
      chain[name] = chain[name] || [fn[key], catchFn, fn, key]
      // debug('add chain:', name, 'to', fn.name)
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
    // debug('invoke start:', colors.bold(`${fn.name}:${invokeType}`), event)
    ctx = Context.from(ctx, event, fn, this)

    console.log('event', ctx.eventId)

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
      // const traceInfo = [
      //   colors.bold(`(${trace.eventType || '-'}) ${trace.name}:${invokeType}`),
      //   trace.spendTime + 'ms',
      //   trace.error ? `[${trace.error.name}] ${trace.error.stack}` : 'OK',
      //   colors.grey(trace.eventId.split('-').pop() || '-')
      // ].join(' ')
      // debug(trace.error ? 'invoke fail:' : 'invoke ok:', traceInfo)
    }

    if (trace.error) {
      --ctx.leftRetries
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        // debug('retry failed after', ctx.retry, 'times')
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
    if (!this.options.systemEvents.includes(type)) { throw new FlyError('event type is do not support broadcast') }
    return Promise.all(
      this.list(type).map(fn => this.call(fn.name, event, ctx))
    )
  }
}

// debug = Fly.Logger('fly', 'debug', 'core')

module.exports = Fly
