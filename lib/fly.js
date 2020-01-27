const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const debug = require('debug')('fly/lib')
const micromatch = require('micromatch')
const colors = require('colors/safe')
const util = require('util')

const Utils = require('./utils')
const Validator = require('./validator')
const { FlyError } = require('./error')

const FN_EXEC_BEFORE = ['before', 'props', 'validate', 'main']
const FN_EXEC_AFTER = ['after']
const FN_RESERVE_KEYS = FN_EXEC_BEFORE.concat(FN_EXEC_AFTER).concat(['config'])
const FN_RESERVE_REGEX = new RegExp(
  `^(${FN_RESERVE_KEYS.join('|')})([a-zA-Z]+)`
)
// const CONTEXT_KEYS = ['eventId', 'eventType', 'parentEvent', 'originalEvent', 'trace', 'call', 'get', 'list', 'type', 'path', 'name', 'config', 'functions', 'extends', 'file', 'dir', 'root', 'events']

const DEFAULT_OPTIONS = {
  env: process.env.NODE_ENV || 'development',
  ext: ['js', 'fly.js'],
  ignore: [
    'node_modules/**',
    'lib/**',
    'bin/**',
    'test/**',
    'tests/**',
    'config/**',
    'public/**',
    '*.test.js'
  ],
  customEvents: ['startup', 'shutdown', 'error'],
  dir: process.cwd(),
  force: false,
  hotreload: false
}

class Fly {
  constructor (config, fly) {
    fly = config instanceof Fly ? config : fly
    this.configs = {}
    this.files = {}
    this.functions = {}
    this.extends = {}
    this.watched = {}

    if (typeof config === 'string') {
      config = { dir: config }
    }

    this.config = { ...DEFAULT_OPTIONS, ...config }
    this.config.dir = path.resolve(this.config.dir)
    this.parent = fly
    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    debug('BOOTSTRAP', this.config.dir)
    this.add(this.config.dir, this.config)
    this.preload(this.config.dir)
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
    if (name[0] === '@' && this.parent) {
      return this.parent.get(name.substr(1, name.length - 1))
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
   * Load function describer
   *
   * @param {String} file
   * @param {Object} flyConfig
   */
  load (file, options) {
    options = options || {}

    try {
      const dir = path.dirname(file)
      const root = this.config.dir
      const config = this.configs[dir]
      const ext = config.ext || this.config.ext

      if (!ext.some(e => file.endsWith('.' + e))) {
        debug('IGNORED_BY_EXT', file)
        return
      } else if (config.ignore && micromatch.any(file, config.ignore, { basename: true })) {
        debug('IGNORED_BY_RULE', file)
        return
      }

      let fn = this.files[file]

      if (options.force && fn) {
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
        debug('NO_MAIN_ENTRY', file)
        throw new FlyError('no main entry or extends')
      }

      const name = (fn.name || path.basename(file, '.js'))

      // Process api
      fn.path = path.relative(this.config.dir, file)
      fn.name = name
      fn.retry = fn.retry === true ? 3 : typeof fn.retry === 'number' ? fn.retry : 0
      fn.file = file
      fn.dir = path.dirname(file)
      fn.root = root
      fn.events = fn.events || {}

      const testFilepath = file.replace(/\.js$/, '.test.js')
      if (fs.existsSync(testFilepath)) {
        fn.test = testFilepath
      }

      if (config['+' + fn.name]) {
        Fly.MergeConfigs(fn, config['+' + fn.name])
      }

      this.parse(fn)

      this.files[file] = fn
      this.functions[fn.name] = fn

      // Hot reload
      if (this.config.hotreload) {
        this.watch(fn.name)
      }

      debug('LOAD_FN', file, fn.name)
      return fn
    } catch (err) {
      debug('LOAD_FN_ERROR', err)
      Fly.OutputWarning('LOAD_FN_ERROR', err.message, file)
      return false
    }
  }

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

    const reloadedFn = this.load(fn.file, { force: true })
    if (!reloadedFn) return false

    debug('FN_RELOAD', name)
    if (this.extends[fn.name]) this.extends[fn.name].forEach(n => this.reload(n))
    return true
  }

  /**
   * Watch file
   *
   * @param {String} file
   */
  watch (name) {
    const fn = this.functions[name]
    if (!fn || this.watched[name]) return
    this.watched[name] = true
    fs.watchFile(fn.file, { interval: 250 }, _ => {
      this.reload(name)
      debug('HOT_RELOAD', name)
    })
  }

  /**
   * Delete
   *
   * @param {String} name
   */
  delete (name) {
    const fn = this.functions[name]
    if (!fn) return false
    debug('FN_DELETE', name)
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
  add (dir, config) {
    debug('ADD_DIR', dir)
    if (!dir) {
      throw new FlyError('no dir argument')
    }

    if (dir[0] !== '/') {
      dir = path.resolve(dir)
    }

    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) {
      throw new FlyError('dir not exists: ' + dir)
    }

    config = { ...this.config, ...config }

    // Check ignore
    const flyConfig = Fly.GetConfig(dir, config.env)
    if (flyConfig) {
      if (flyConfig.ignore) {
        flyConfig.ignore = config.ignore.concat(flyConfig.ignore.map(pattern => path.join(dir, pattern)))
      }
      // Overwrite again
      config = { ...config, ...flyConfig }
    }
    // Save full dir config
    this.configs[dir] = config

    fs.readdirSync(dir).forEach(file => {
      if (file[0] === '.') return
      let filePath = path.join(dir, file)
      let stat = fs.statSync(filePath)
      let isFile = stat.isFile()

      if (isFile) {
        this.load(filePath)
      } else if (
        stat.isDirectory() &&
        // force ignore node_modules
        file !== 'node_modules' &&
        // Ignore hidden folders
        !file.startsWith('.') &&
        // Check DIR/_ is ignore by pattern
        (!config.ignore || !micromatch.any(path.join(filePath, '_'), config.ignore))
      ) {
        this.add(filePath, config)
      }
    })

    return true
  }

  /**
   *
   * @param {String} dir
   */
  preload () {
    // Process extends
    Object.keys(this.functions).forEach(name => {
      if (!this.functions[name].extends) return
      this.extend(name)
    })
  }

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
      debug('EXTENDS', name, key, 'from', fromName)
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
   * @returns {Array}
   */
  list (type) {
    const functions = []
    Object.keys(this.functions).forEach(name => {
      // Ignore no events
      if (type && (!this.functions[name].events || !this.functions[name].events[type])) return

      // Push to function
      !functions.includes(this.functions[name]) && functions.push(this.functions[name])
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

    const chain = []
    let ctx = initalContext || {}
    debug('CALL', fn.name, ctx.eventType)

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
          debug('ADD_CHAIN', fn.name, fn[key])
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
    const keepCtx = this.getFnCtx(ctx)
    ctx = this.getCtx(Object.assign(ctx, this.getFnCtx(fn)), fn, event)

    const trace = ctx.trace
    ctx.leftRetries = ctx.leftRetries || ctx.retry || 1

    let ret

    try {
      ret = await callee.call(fn, event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      debug('TRACE', [
        trace.eventId.split('-').pop(),
        trace.eventType || 'call',
        trace.name + ':' + trace.invokeType,
        trace.spendTime + 'ms',
        trace.error || 'OK'
      ].join(' '))
      Object.assign(ctx, keepCtx)
    }

    if (trace.error) {
      ctx.leftRetries--
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        debug('RETRY_REASON', trace.error.message)
        ret = this.invoke(callee, fn, event, ctx)
      }
    }

    return ret
  }

  return (result) {
    return { $return: result }
  }

  getFnCtx (fn) {
    return {
      ...fn.eventType ? { eventType: fn.eventType } : null,
      parentEvent: fn.parentEvent,
      name: fn.name,
      file: fn.file,
      dir: fn.dir,
      trace: fn.trace
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
    if (!this.config.customEvents.includes(type)) { throw new FlyError('event type is do not support broadcast') }
    return Promise.all(
      this.list(type).map(fn => this.call(fn, event, ctx).catch(err =>
        debug(`BROADCAST_ERROR ${fn.name} ${err.message}`)
      ))
    )
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
    if (!ctx.env) ctx.env = this.config.env

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

    // if (!ctx.call) {
    //   ctx.call = (name, evt, context) => {
    //     return this.call(name, evt, Object.assign(ctx, { invokeType: '' }, context || {}))
    //   }
    // }
    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.return) ctx.return = this.return
    if (!ctx.get) ctx.get = name => this.get(name, ctx)

    // check loadFunctions for initial
    ctx.loadFunctions && ctx.loadFunctions.forEach(n => delete ctx[n])
    ctx.loadFunctions = []
    Object.keys(this.functions).forEach(name => {
      if (ctx.alias && ctx.alias[name]) {
        name = ctx.alias[name]
      }
      ctx[name] = (evt, context) => this.call(name, evt, Object.assign(ctx,
        { invokeType: '', eventType: null }, context || {}
      ))
      ctx.loadFunctions.push(name)
    })
    ctx.error = this.error.bind(this)
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
      colors.bgRed(Utils.padding(type, 12)),
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
   * Merge config
   *
   * @param {Object} config
   * @param {Object} serviceConfigItem
   */
  static MergeConfig (config, serviceConfigItem, name) {
    if (!config || !serviceConfigItem) return serviceConfigItem || config || {}

    let finalConfig = {}
    Object.keys(serviceConfigItem).forEach(key => {
      if (key[0] !== '@') {
        config[key] = serviceConfigItem[key]
      } else if (key === `@${name}`) {
        /**
         * Support
         *
         * config:
         *  @test:
         *    token: privateTokenForTestOnly
         */
        finalConfig = serviceConfigItem[key]
      }
    })
    return Object.assign(config, finalConfig)
  }

  /**
   * Merge configs
   *
   * @param {Object} fn
   * @param {Object} dirConfig
   */
  static MergeConfigs (fn, dirConfig) {
    dirConfig = dirConfig || {}
    fn.config = Fly.MergeConfig(fn.config, dirConfig.config, fn.name)
    if (fn.events) {
      Object.keys(fn.events).forEach(type => {
        if (!dirConfig.events || !dirConfig.events[type]) return
        Fly.MergeConfig(fn.events[type], dirConfig.events[type], fn.name)
      })
    } else {
      fn.events = {}
    }
    return fn
  }

  /**
   * Load fly.yml from dir
   *
   * @param {String} dir
   */
  static GetConfig (dir, env) {
    let config
    let configFile = path.join(dir, 'fly.yml')
    let configEnvFile = env ? path.join(dir, `fly.${env}.yml`) : null
    if (!fs.existsSync(configFile)) return

    try {
      config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'))
      if (configEnvFile && fs.existsSync(configEnvFile)) {
        let envConfig = yaml.safeLoad(fs.readFileSync(configEnvFile, 'utf8'))
        if (envConfig) {
          Object.keys(envConfig).forEach(key => {
            if (typeof config[key] === 'object') {
              config[key] = Object.assign(config[key], envConfig[key])
            } else {
              config[key] = envConfig[key]
            }
          })
        }
      }
    } catch (err) {
      Fly.OutputWarning('CONFIG_FAILED', err.message, dir)
      throw err
    }

    return config
  }
}

module.exports = Fly
