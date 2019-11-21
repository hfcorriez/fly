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

const ROOT_DIR = path.join(__dirname, '../')
const FN_RESERVE_KEYS = ['before', 'after', 'validate', 'catch', 'props']
const FN_DEFINE_REGEX = new RegExp(
  `^(${FN_RESERVE_KEYS.join('|')})([a-zA-Z]+)`
)
// const CONTEXT_KEYS = ['eventId', 'eventType', 'parentEvent', 'originalEvent', 'trace', 'call', 'get', 'list', 'type', 'path', 'name', 'config', 'functions', 'extends', 'file', 'dir', 'root', 'events']

const DEFAULT_OPTIONS = {
  env: process.env.NODE_ENV || 'development',
  config: {
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
    ]
  },
  broadcastEvents: ['startup', 'shutdown', 'error'],
  dir: process.cwd(),
  force: false
}

class Fly {
  constructor (options) {
    this.configs = {}
    this.files = {}
    this.functions = {}
    this.extends = {}

    if (typeof options === 'string') {
      options = { dir: options }
    }

    this.options = Object.assign({}, DEFAULT_OPTIONS, options || {})
    this.options.dir = path.resolve(this.options.dir)
    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    debug('FLY DIR', this.options.dir)
    this.add(this.options.dir, this.options.config)
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
    if (!name) throw FlyError('no name given')
    if (name[0] === '/') {
      return this.files[name]
    }
    return this.functions[name]
  }

  /**
   *
   * @param {String} link
   * @param {Object} options
   */
  resolve (link, options) {
    options = Object.assign({ dir: this.options.dir }, options || {})
    if (link[0] === '/' || link[0] === '.') {
      return {
        type: 'file',
        file: require.resolve(link, { paths: [options.dir] })
      }
    } else if (link[0] === '@') {
      return {
        type: 'file',
        file: path.join(ROOT_DIR, './commands/' + link.substr(1))
      }
    } else if (/^[a-z0-9@][a-z0-9@\-/]*[a-z0-9]$/.test(link)) {
      return {
        type: 'package',
        file: require.resolve(link)
      }
    } else if (/^[a-zA-Z0-9][a-zA-Z0-9\-/]+[a-zA-Z0-9]/.test(link)) {
      // github
      debug('UNSUPPORTED_GITHUB')
    } else if (/^git:/.test(link)) {
      debug('UNSUPPORTED_GIT')
    } else if (/^https?:/.test(link)) {
      debug('UNSUPPORTED_URL')
    }
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
  load (file, force) {
    try {
      const dir = path.dirname(file)
      const root = this.options.dir
      const config = { ...this.configs[root], ...this.configs[dir] }
      const ext = config.ext || this.options.config.ext

      if (!ext.some(e => file.endsWith('.' + e))) {
        debug('IGNORED_BY_EXT', file)
        return
      } else if (config.ignore && micromatch.any(file, config.ignore, { basename: true })) {
        debug('IGNORED_BY_RULE', file)
        return
      }

      let fn = this.files[file]

      if (force) {
        delete require.cache[file]
      } else if (fn) {
        return fn
      }

      fn = { ...require(file) }
      if (fn.toString().startsWith('class ')) {
        throw FlyError('class is not support')
      }

      if (fn.extends) {
        let resolved = this.resolve(fn.extends, { dir: path.dirname(file) })
        if (!resolved || !resolved.file) {
          throw FlyError(`extends "${fn.extends}" error: ${file}`)
        }
        fn = { ...require(resolved.file), ...fn }
        this.extends[resolved.file] = this.extends[resolved.file] || []
        this.extends[resolved.file].push(file)
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function') {
        debug('NO_MAIN', file)
        throw FlyError('no main entry')
      }

      // Process api
      fn.path = path.relative(this.options.dir, file)
      fn.name = fn.name || path.basename(file, '.js')
      fn.main = fn.main.bind(fn)
      fn.retry = fn.retry === true ? 3 : typeof fn.retry === 'number' ? fn.retry : 0
      fn.before = fn.before ? fn.before.bind(fn) : null
      fn.after = fn.after ? fn.after.bind(fn) : null
      fn.validate = fn.validate ? fn.validate.bind(fn) : null
      fn.file = file
      fn.dir = path.dirname(file)
      fn.root = root
      fn.events = fn.events || {}
      fn.catch = fn.error || fn.catch ? (fn.error || fn.catch).bind(this) : null

      Object.keys(fn).forEach(key => {
        const matched = key.match(FN_DEFINE_REGEX)
        if (!matched) return

        const type = matched[1].toLowerCase()
        const event = matched[2].toLowerCase()

        fn.events[event] = Object.assign(
          fn.events[event] || {},
          type === 'config' ? (typeof fn[key] === 'function' ? fn[key]() : fn[key]) || {} : { [type]: fn[key].bind(fn) }
        )
        // fn[key] = fn[key].bind(fn)
      })

      if (config['+' + fn.name]) {
        Fly.MergeConfigs(fn, config['+' + fn.name])
      }

      this.files[file] = fn
      this.functions[fn.name] = fn

      debug('FN_LOAD', file, fn.name)
      return fn
    } catch (err) {
      debug('FN_LOAD_ERROR', err)
      Fly.OutputWarning('FN_LOAD_ERROR', err.message, file)
      return false
    }
  }

  /**
   * Reload
   *
   * @param {String} file
   */
  reload (file) {
    if (!this.load(file, true)) return false
    debug('FN_RELOAD', file)
    if (this.extends[file]) this.extends[file].forEach(f => this.reload(f))
    return true
  }

  /**
   * Delete
   *
   * @param {String} file
   */
  delete (file) {
    const fn = this.files[file]
    if (!fn) return false
    debug('FN_DELETE', file)
    delete this.files[file]
    delete this.functions[fn.name]
    delete this.extends[file]
    delete require.cache[file]
    return true
  }

  /**
   * Load dir
   *
   * @param {String} dir
   * @param {String | Null} dir
   * @param {Object | Null} options
   */
  add (dir, options) {
    if (!dir) {
      throw FlyError('no dir argument passed')
    }

    if (dir[0] !== '/') {
      dir = path.resolve(dir)
    }

    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) {
      throw FlyError('not dir or dir not exists: ' + dir)
    }

    options = { ...dir.startsWith(this.options.dir) ? { config: this.options.config } : null, ...options }

    let config
    if (this.configs[dir]) {
      config = this.configs[dir]
    } else {
      let flyConfig = Fly.GetConfig(dir, this.options.env)
      if (
        // Fly config
        !flyConfig &&
        // Dir check
        dir === this.options.dir &&
        // Force
        !this.options.force &&
        // Check root dir
        !this.options.dir.startsWith(ROOT_DIR)
      ) {
        debug('can not load dir without fly.yml')
        return false
      }
      config = this.configs[dir] = { ...options.config, ...flyConfig }
    }

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
        this.add(filePath, { config })
      }
    })

    return true
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
      // Not-root link function will ignore
      if (name.includes('@')) return

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
    if (!name) throw FlyError('no name to call')
    if (!event) event = {}
    if (typeof event !== 'object') throw FlyError('illegal event')

    let targetEvent
    let fn = typeof name.main === 'function' ? name : this.get(name, initalContext)
    if (!fn) throw FlyError(`no function to call: ${name}`)

    let chian = []
    let ctx = initalContext || {}

    const eventType = ctx.eventType
    if (eventType && fn.events && fn.events[eventType]) {
      targetEvent = fn.events[eventType]
    }

    targetEvent && targetEvent.props && chian.push((event) => Validator.validateEvent(event, targetEvent.props))
    targetEvent && targetEvent.validate && chian.push(targetEvent.validate)
    targetEvent && targetEvent.before && chian.push(targetEvent.before)
    fn.props && chian.push((event) => Validator.validateEvent(event, fn.props))
    fn.validate && chian.push(fn.validate)
    fn.before && chian.push(fn.before)
    fn.main && chian.push(fn.main)
    fn.after && chian.push(fn.after)
    targetEvent && targetEvent.after && chian.push(targetEvent.after)

    while (chian.length) {
      // Restore ctx
      ctx = this.getContext(Object.assign(ctx, fn, { eventType }), event)
      try {
        const callee = chian.shift()
        const ret = await this.invoke(callee, event, ctx)
        // Only event is object pass as next event
        if (typeof ret === 'object') event = ret
      } catch (err) {
        const callee = (targetEvent && targetEvent.catch) || fn.catch
        if (!callee) {
          this.error(err)
          throw err
        }
        ctx = this.getContext(Object.assign(ctx, fn, { eventType }), event)
        return this.invoke(callee, err, ctx)
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
  async invoke (fn, event, ctx) {
    const trace = ctx.trace
    let ret

    ctx.leftRetries = ctx.leftRetries || ctx.retry || 1

    try {
      ret = await fn(event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      debug([
        trace.name + ':' + trace.type,
        trace.eventType || '●',
        trace.spendTime + 'ms',
        trace.error || '-',
        trace.eventId
      ].join(' | '))
    }

    if (trace.error) {
      ctx.leftRetries--
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        debug('RETRY_REASON', trace.error.message)
        return this.invoke(fn, event, ctx)
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
    if (!type) throw FlyError('event type is requried')
    if (!this.options.broadcastEvents.includes(type)) { throw FlyError('event type is do not support broadcast') }
    let functions = this.list(type)
    return Promise.all(
      functions.map(fn => this.call(fn, event, ctx).catch(err =>
        debug(`BROADCAST_ERROR ${fn.name} ${err.message}`)
      ))
    )
  }

  /**
   * Create context for function
   *
   * @param {Object} ctx
   */
  getContext (ctx, event) {
    ctx = ctx || {}
    // ctx = CONTEXT_KEYS.map(key => ({ [key]: ctx[key] })).reduce((res, o) => ({ ...res, ...o }), {})

    if (!ctx.eventId) ctx.eventId = uuidv4()

    // Event only exists in invoke
    if (!ctx.hasOwnProperty('originalEvent')) ctx.originalEvent = event
    else ctx.parentEvent = event

    // Trace
    ctx.trace = {
      name: ctx.name,
      type: ctx.type || '',
      startTime: Date.now(),
      eventType: ctx.eventType,
      eventId: ctx.eventId
    }

    if (!ctx.call) {
      ctx.call = (name, evt, context) => this.call(name, evt, Object.assign(ctx, { type: '' }, context || {}))
    }
    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.get) ctx.get = name => this.get(name, ctx)

    Object.keys(this.functions).forEach(name => {
      if (ctx[name]) return
      ctx[name] = (evt, context) => this.call(this.get(name), evt, Object.assign(ctx, { type: '', eventType: null }, context || {}))
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
