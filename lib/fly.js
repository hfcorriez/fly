const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const micromatch = require('micromatch')
const colors = require('colors/safe')
const util = require('util')
const Utils = require('./utils')
const Validator = require('./validator')
const { FlyError } = require('./error')
const Debug = require('debug')
const chokidar = require('chokidar')

const ROOT_DIR = path.join(__dirname, '..')
const FN_EXEC_BEFORE = ['before', 'props', 'validate', 'main']
const FN_EXEC_AFTER = ['after']
const FN_RESERVE_KEYS = FN_EXEC_BEFORE.concat(FN_EXEC_AFTER).concat(['config', 'catch'])
const FN_RESERVE_REGEX = new RegExp(
  `^(${FN_RESERVE_KEYS.join('|')})([a-zA-Z]+)`
)
const DEBUG_COLORS = { fatal: 1, warn: 3, info: 4, debug: 5 }
// const CONTEXT_KEYS = ['eventId', 'eventType', 'parentEvent', 'originalEvent', 'trace', 'call', 'get', 'list', 'type', 'path', 'name', 'config', 'functions', 'extends', 'file', 'dir', 'root', 'events']

let info, debug

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
  systemEvents: ['startup', 'shutdown', 'error'],
  dir: process.cwd(),
  hotreload: false
}

class Fly {
  constructor (config) {
    this.files = {}
    this.functions = {}
    this.extends = {}
    this.mounts = {}
    this.imports = {}

    if (typeof config === 'string') {
      config = { dir: config }
    }

    this.config = { project: { ...DEFAULT_PROJECT_CONFIG, ...config } }
    this.config.project.dir = path.resolve(this.config.project.dir)
    if (!this.config.project.name) {
      this.config.project.name = this.config.project.dir.split('/').pop()
    }

    // Process mounts
    if (config.mounts) {
      Object.keys(config.mounts).forEach(key => {
        if (!this.mounts[key]) this.mounts[key] = []
        const dir = config.mounts[key]
        this.mounts[key].push(dir)
      })
    }

    if (typeof config.hotreload !== 'boolean' && this.config.project.env === 'development') {
      this.config.project.hotreload = true
    }

    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    info('BOOTSTRAP', this.config.project.dir)
    const flyConfig = Fly.GetConfig(this.config.project.dir, this.config.project.env)
    Object.assign(this.config.project, flyConfig.project || {})
    delete flyConfig.project
    Object.assign(this.config, flyConfig)

    // Merge ignore
    this.config.project.ignore = this.config.project.defaultIgnore.concat(this.config.project.ignore || [])

    // Avoid project mount in fly root dir
    if (this.config.project.dir !== ROOT_DIR) {
      this.mount(this.config.project.dir)
    }

    // Mount all dirs
    Object.keys(this.mounts).forEach(prefix => {
      this.mounts[prefix].forEach(dir => this.mount(dir, prefix))
    })
  }

  /**
   * Mount dir
   *
   * @param {String} dir
   * @param {String} prefix
   */
  mount (dir, prefix) {
    this.add(dir, prefix)
    this.preload(dir)
  }

  /**
   * Import
   *
   * @param {String} file
   */
  import (file, force) {
    file = require.resolve(file)
    if (this.imports[file] && !force) return this.imports[file]

    info('IMPORT_LOAD', file)
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
    return this.functions[name]
  }

  /**
   * Exists function
   *
   * @param {String} name
   */
  exists (name) {
    return !!this.get(name)
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
    info('CONFIG_OVERWRITE', name, event, config)
    return true
  }

  /**
   * Load function describer
   *
   * @param {String} file
   * @param {Object} flyConfig
   */
  load (file, options) {
    const { force, prefix = '' } = options || {}

    try {
      const { dir, ext, ignore } = this.config.project
      const filePath = path.relative(dir, file)

      if (!ext.some(e => file.endsWith('.' + e))) {
        // info('IGNORED_BY_EXT', file)
        return
      } else if (micromatch.any(filePath, ignore, { basename: true })) {
        // info('IGNORED_BY_RULE', file)
        return
      }

      let fn = this.files[file]

      if (force && fn) {
        delete require.cache[file]
      } else if (fn) {
        return fn
      }

      const fileObj = require(file)
      fn = typeof fileObj === 'function' ? { main: fileObj } : { ...require(file) }
      if (fn.toString().startsWith('class ')) {
        throw new FlyError('class is not support')
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function' && typeof fn.extends !== 'string') {
        info('NO_MAIN_ENTRY', file)
        throw new FlyError('no main entry or extends')
      }

      const name = (fn.name || path.basename(file, '.js'))

      // Process api
      fn.path = path.relative(dir, file)
      fn.name = prefix + name
      fn.prefix = prefix
      fn.retry = fn.retry === true ? 3 : typeof fn.retry === 'number' ? fn.retry : 0
      fn.file = file
      fn.dir = path.dirname(file)
      fn.root = dir
      fn.events = fn.events || {}
      fn.fly = this

      const testFilepath = file.replace(/\.js$/, '.test.js')
      if (fs.existsSync(testFilepath)) {
        fn.test = testFilepath
      }

      this.parse(fn)

      this.files[file] = fn
      this.functions[fn.name] = fn

      info('LOAD_FN', file, fn.name)
      return fn
    } catch (err) {
      info('LOAD_FN_ERROR', err)
      Fly.OutputWarning('LOAD_FN_ERROR', `ignore ${file}`, err.message)
      return false
    }
  }

  /**
   * Parse function info
   *
   * @param {Object} fn
   */
  parse (fn) {
    Object.keys(fn).forEach(key => {
      const matched = key.match(FN_RESERVE_REGEX)
      if (!matched) return

      const type = matched[1].toLowerCase()
      const event = matched[2].toLowerCase()

      fn.events[event] = Object.assign(
        fn.events[event] || {},
        type === 'config' ? (
          typeof fn[key] === 'function' ? fn[key]() : fn[key]
        ) || {} : { [type]: fn[key] }
      )
      // fn[key] = fn[key].bind(fn)
    })

    return fn
  }

  /**
   * Reload
   *
   * @param {String} file
   */
  reload (name) {
    const fn = this.functions[name]
    if (!fn) return false

    const reloadedFn = this.load(fn.file, { force: true, prefix: fn.prefix })
    if (!reloadedFn) return false

    info('RELOAD', name)
    if (this.extends[fn.name]) this.extends[fn.name].forEach(n => this.reload(n))
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
    info('DELETE', name)
    delete this.files[fn.file]
    delete this.functions[name]
    delete this.extends[name]
    delete require.cache[fn.file]
    return true
  }

  /**
   * Load dir
   *
   * @param {String} dir
   * @param {String | Null} dir
   * @param {Object | Null} config
   */
  add (dir, prefix) {
    info('ADD_DIR', dir)
    if (!dir) {
      throw new FlyError('no dir argument')
    }

    const config = this.config

    if (dir[0] !== '/') {
      dir = path.resolve(dir)
    }

    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) {
      throw new FlyError('dir not exists: ' + dir)
    }

    fs.readdirSync(dir).forEach(file => {
      if (file[0] === '.') return
      let filePath = path.join(dir, file)
      let stat = fs.statSync(filePath)
      let isFile = stat.isFile()

      if (isFile) {
        this.load(filePath, { prefix })
      } else if (
        stat.isDirectory() &&
        // force ignore node_modules
        file !== 'node_modules' &&
        // Ignore hidden folders
        !file.startsWith('.') &&
        // Check DIR/_ is ignore by pattern
        (!config.project.ignore || !micromatch.any(path.join(filePath, '_'), config.project.ignore))
      ) {
        this.add(filePath, prefix)
      }
    })

    return true
  }

  /**
   *
   * @param {String} dir
   */
  preload (dir) {
    info('PRELOAD', dir)
    const config = this.config

    // Config events
    Object.keys(config || {}).forEach(event => {
      // Ignore project setting
      if (event === 'project') return

      // Merge event setting
      Object.keys(config[event]).forEach(name => {
        this.set(name, event, config[event][name])
      })
    })

    // Process extends
    Object.keys(this.functions).forEach(name => {
      if (!this.functions[name].extends) return
      this.extend(name)
    })

    if (this.config.project.hotreload) {
      info('HOTRELOAD SETUP', dir)
      chokidar.watch(dir, { ignoreInitial: true }).on('all', (event, file) => {
        info('HOTRELOAD', event, file)
        switch (event) {
          case 'change':
            if (this.files[file]) {
              this.reload(this.files[file].name)
            } else if (this.imports[file]) {
              this.import(file, true)
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
  extend (name, fromName) {
    const fn = this.get(name)
    fromName = fromName || fn.extends
    if (!fromName || (this.extends[fromName] && this.extends[fromName].includes(name))) return
    const fromFn = this.get(fromName)
    if (!fromFn) {
      throw new FlyError(`${name} extends "${fromName}" not found`)
    }
    if (fromFn.extends && !fromFn.extends.startsWith('@')) {
      this.extend(fromFn.name)
    }
    Object.keys(fromFn).forEach(key => {
      if (fn[key] || typeof fromFn[key] !== 'function') return
      info('EXTENDS', name, key, 'from', fromName)
      fn[key] = fromFn[key]
    })
    this.parse(fn)
    this.extends[fromName] = this.extends[fromName] || []
    this.extends[fromName].includes(name) || this.extends[fromName].push(name)
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
    Object.keys(this.functions).forEach(name => {
      const fn = this.functions[name]
      if (type && !fn.events[type]) return
      if (options.type === 'project' && fn.prefix) return
      !functions.includes(fn) && functions.push(fn)
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

    let eventFn
    let fn = name.events ? name : this.get(name)
    if (!fn) throw new FlyError(`no function to call: ${name}`)
    if (fn.fly !== this) return fn.fly.call(name, event, initalContext)

    const chain = []
    let ctx = initalContext || {}
    info('CALL', fn.name, ctx.eventType)

    const eventType = ctx.eventType
    const eventTypeCap = eventType && Utils.ucfirst(eventType)
    if (eventType && fn.events && fn.events[eventType]) {
      eventFn = fn.events[eventType]
    }

    const FNS_BEFORE = eventTypeCap ? FN_EXEC_BEFORE.map(f => f + eventTypeCap).concat(FN_EXEC_BEFORE) : FN_EXEC_BEFORE
    const FNS_AFTER = eventTypeCap ? FN_EXEC_AFTER.map(f => f + eventTypeCap).concat(FN_EXEC_AFTER) : FN_EXEC_AFTER

    FNS_BEFORE.forEach(key => {
      if (key === 'props' && fn.props) {
        chain.push([(event) => Validator.validateEvent(event, fn.props), fn, key])
      } else if (typeof fn[key] === 'function') {
        chain.push([fn[key], fn, key])
      } else if (typeof fn[key] === 'string' || Array.isArray(fn[key])) {
        const hookFns = Array.isArray(fn[key]) ? fn[key] : [fn[key]]
        for (let hookFnName of hookFns) {
          const hookFn = this.get(hookFnName)
          if (!hookFn) throw new FlyError('no functon found')
          info('ADD_CHAIN', fn.name, fn[key])
          chain.push([(event, ctx) => this.call(hookFnName, event, ctx), fn, key])
        }
      }
    })

    // [AFTER] function exec
    FNS_AFTER.forEach(key => fn[key] && chain.push([fn[key], fn, key]))

    while (chain.length) {
      // Restore ctx
      const [callee, calleeFn, invokeType] = chain.shift()
      try {
        event = await this.invoke(callee, calleeFn, event, Object.assign(ctx, { invokeType }))
        if (event && event.$return) {
          return event.$return
        }
      } catch (err) {
        const callee = (eventFn && eventFn.catch) || fn.catch
        if (!callee) {
          this.error(err)
          throw err
        }
        return this.invoke(callee, calleeFn, err, Object.assign(ctx, { invokeType: 'catch' }))
      }
    }

    return event
  }

  /**
   * Call function without event match
   *
   * @param {String} fn    Function name
   * @param {Object} event
   * @param {Object} ctx
   * @returns {*}
   */
  async invoke (callee, fn, event, ctx) {
    debug(`INVOKE ${fn.name}:${ctx.invokeType}`, JSON.stringify(event))
    const keepCtx = this.getFnCtx(fn, ctx)
    ctx = this.getCtx(Object.assign(ctx, this.getFnCtx(fn, ctx)), event)

    const trace = ctx.trace
    ctx.leftRetries = ctx.leftRetries || ctx.retry || 1

    let ret

    try {
      ret = await callee.call(fn, event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      info('TRACE', [
        trace.eventId.split('-').pop(),
        trace.eventType || 'call',
        trace.name + ':' + trace.invokeType,
        trace.spendTime + 'ms',
        trace.error ? `[${trace.error.name}] ${trace.error.message}` : 'OK'
      ].join(' '))
      Object.assign(ctx, keepCtx)
    }

    if (trace.error) {
      ctx.leftRetries--
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        info('RETRY_REASON', trace.error.message)
        ret = this.invoke(callee, fn, event, ctx)
      }
    }

    return ret
  }

  /**
   * Force return
   *
   * @param {Any} result
   */
  return (result) {
    return { $return: result }
  }

  /**
   * Get function context for using
   */
  getFnCtx (fn, ctx) {
    return {
      ...ctx.eventType ? { eventType: ctx.eventType } : null,
      // config: fn.events[ctx.eventType],
      name: fn.name,
      parentEvent: fn.parentEvent,
      extends: fn.extends,
      prefix: fn.prefix,
      trace: fn.trace,
      alias: fn.alias,
      imports: fn.imports,
      dir: fn.dir
    }
  }

  /**
   *
   * @param {String} type
   * @param {Object | Null} event
   * @param {Object | Null} ctx
   */
  broadcast (type, event, ctx) {
    if (!type) throw new FlyError('event type is requried')
    if (!this.config.project.systemEvents.includes(type)) { throw new FlyError('event type is do not support broadcast') }
    return Promise.all(
      this.list(type).map(fn => this.call(fn, event, ctx).catch(err =>
        info(`BROADCAST_ERROR ${fn.name} ${err.message}`)
      ))
    )
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

  /**
   * Create context for function
   *
   * @param {Object} ctx
   */
  getCtx (ctx, event) {
    ctx = ctx || {}
    // ctx = CONTEXT_KEYS.map(key => ({ [key]: ctx[key] })).reduce((res, o) => ({ ...res, ...o }), {})

    if (!ctx.fly) ctx.fly = this
    if (!ctx.eventId) ctx.eventId = uuidv4()

    // Apply fly.yml config to ctx
    Object.keys(this.config).forEach(key => {
      if (!ctx[key]) ctx[key] = this.config[key]
    })

    // Event only exists in invoke
    if (!ctx.hasOwnProperty('originalEvent')) ctx.originalEvent = event
    else ctx.parentEvent = event

    if (!ctx.traces) ctx.traces = []

    // Trace
    ctx.trace = {
      name: ctx.name,
      invokeType: ctx.invokeType || '',
      startTime: Date.now(),
      eventType: ctx.eventType,
      eventId: ctx.eventId
    }

    if (!ctx.traces.includes(ctx.trace)) ctx.traces.push(ctx.trace)

    if (!ctx.call) {
      ctx.call = async (name, evt, context) => {
        const n = typeof name === 'object' ? name : (this.exists(name) ? name : ctx.prefix + name)
        let result, err
        try {
          result = await this.call(n, evt, Object.assign(ctx, { invokeType: '' }, context || {}))
        } catch (e) {
          err = e
        }
        return [result, err]
      }
    }
    if (!ctx.super) {
      ctx.super = (evt) => {
        if (!ctx.extends || !ctx.invokeType) return evt
        const fn = this.get(ctx.extends)
        if (!fn[ctx.invokeType]) return evt
        return this.invoke(fn[ctx.invokeType], fn, evt, ctx)
      }
    }
    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.return) ctx.return = this.return
    if (!ctx.get) ctx.get = name => this.get(name, ctx)
    if (!ctx.error) ctx.error = this.error.bind(this)

    // Log info
    if (!ctx.debug) ctx.debug = Fly.Logger(this.config.project.name, 'debug', ctx.name)
    if (!ctx.info) ctx.info = Fly.Logger(this.config.project.name, 'info', ctx.name)
    if (!ctx.warn) ctx.warn = Fly.Logger(this.config.project.name, 'warn', ctx.name)
    if (!ctx.fatal) ctx.fatal = Fly.Logger(this.config.project.name, 'fatal', ctx.name)

    // check loadFunctions for initial
    if (ctx.loadFor !== ctx.name) {
      ctx.loadFor = ctx.name
      ctx.loadFunctions && ctx.loadFunctions.forEach(n => delete ctx[n])
      ctx.loadFunctions = []
      Object.keys(this.functions).forEach(name => {
        if (ctx.alias && ctx.alias[name]) {
          name = ctx.alias[name]
        }
        ctx[name] = (evt, context) => this.call(name, evt, Object.assign(ctx,
          { invokeType: '', eventType: null }, context || {}
        ))
        debug('ADD_FN', name)
        ctx.loadFunctions.push(name)
      })

      /**
     * Process imports
     */
      ctx.loadImports && ctx.loadImports.forEach(n => delete ctx[n])
      ctx.loadImports = []
      Object.keys(this.config.project.imports || {}).forEach(key => {
        const filePath = path.join(this.config.project.dir, this.config.project.imports[key])
        debug('ADD_IMPORT', key, filePath)
        ctx[key] = this.import(filePath)
        ctx.loadImports.push(key)
      })

      Object.keys(ctx.imports || {}).forEach(key => {
        const filePath = path.join(ctx.dir, ctx.imports[key])
        debug('ADD_IMPORT', key, filePath)
        ctx[key] = this.import(filePath)
        ctx.loadImports.push(key)
      })
    }

    return ctx
  }

  /**
   *
   * @param {Error|Object} err
   */
  error (err) {
    if (typeof err === 'undefined') return

    if (!(err instanceof Error)) {
      err = new Error(util.inspect(err, { depth: null, breakLength: Infinity }))
    }

    this.broadcast('error', err)
  }

  /**
   * OutputWarning
   *
   * @param {String} type
   * @param {String} error
   * @param {Mixed} info
   */
  static OutputWarning (type, error, info) {
    console.warn(
      colors.yellow(Utils.padding(type, 12)),
      error ? colors.red(error) : '',
      info
    )
  }

  /**
   *
   * @param {String} file
   * @param {String} dir
   */
  static BuildFunctionName (filePath) {
    return filePath
      .replace(/\//g, '.')
      .replace(/\.js$/, '')
      .replace(/[-_]([a-z])/g, (_, word) => word.toUpperCase())
  }

  /**
   * Load fly.yml from dir
   *
   * @param {String} dir
   */
  static GetConfig (dir, env) {
    let config = {}
    let configFile = path.join(dir, 'fly.yml')
    let configEnvFile = env ? path.join(dir, `fly.${env}.yml`) : null

    if (!fs.existsSync(configFile)) return config

    try {
      config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'))
      if (configEnvFile && fs.existsSync(configEnvFile)) {
        let envConfig = yaml.safeLoad(fs.readFileSync(configEnvFile, 'utf8'))
        if (envConfig) {
          Object.keys(envConfig).forEach(key => {
            if (typeof config[key] === 'object' || typeof envConfig[key] === 'object') {
              config[key] = Object.assign(config[key] || {}, envConfig[key] || {})
            } else {
              config[key] = envConfig[key]
            }
          })
        }
      }
    } catch (err) {
      Fly.OutputWarning('CONFIG_FAILED', err.message, dir)
    }

    return config
  }
}

info = Fly.Logger('fly', 'info', 'core')
debug = Fly.Logger('fly', 'debug', 'core')

module.exports = Fly
