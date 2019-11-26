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
const FN_EXEC_BEFORE = ['before', 'props', 'validate', 'main']
const FN_EXEC_AFTER = ['after']
const FN_RESERVE_KEYS = ['before', 'after', 'validate', 'catch', 'props', 'config']
const FN_DEFINE_REGEX = new RegExp(
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
  constructor (config) {
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
    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    debug('BOOTSTRAP', this.config.dir)
    this.add(this.config.dir, this.config)
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
   *
   * @param {String} link
   * @param {Object} config
   */
  resolve (link, config) {
    config = Object.assign({ dir: this.config.dir }, config || {})
    if (link[0] === '/' || link[0] === '.') {
      return {
        type: 'file',
        file: require.resolve(link, { paths: [config.dir] })
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
        if (fn.name.includes('@')) {
          options.component = fn.name.split('@').shift()
        }
      } else if (fn) {
        return fn
      }

      const fileObj = require(file)
      fn = typeof fileObj === 'function' ? { main: fileObj } : { ...require(file) }
      if (fn.toString().startsWith('class ')) {
        throw new FlyError('class is not support')
      }

      if (fn.extends) {
        let resolved = this.resolve(fn.extends, { dir: path.dirname(file) })
        if (!resolved || !resolved.file) {
          throw new FlyError(`extends "${fn.extends}" error: ${file}`)
        }
        fn = { ...require(resolved.file), ...fn }
        this.extends[resolved.file] = this.extends[resolved.file] || []
        this.extends[resolved.file].push(file)
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function') {
        debug('NO_MAIN_ENTRY', file)
        throw new FlyError('no main entry')
      }

      const name = (options.component ? options.component + '@' : '') + (fn.name || path.basename(file, '.js'))

      // Process api
      fn.path = path.relative(this.config.dir, file)
      fn.name = name
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
      fn.components = { ...config.components, ...config.components, ...fn.components }

      const testFilepath = file.replace(/\.js$/, '.test.js')
      if (fs.existsSync(testFilepath)) {
        fn.test = testFilepath
      }

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

      // Hot reload
      if (this.config.hotreload) {
        this.watch(file)
      }

      debug('LOAD_FN', file, fn.name)
      return fn
    } catch (err) {
      debug('LOAD_FN_ERROR', err)
      Fly.OutputWarning('LOAD_FN_ERROR', err.message, file)
      return false
    }
  }

  /**
   * Reload
   *
   * @param {String} file
   */
  reload (file) {
    if (!this.load(file, { force: true })) return false
    debug('FN_RELOAD', file)
    if (this.extends[file]) this.extends[file].forEach(f => this.reload(f))
    return true
  }

  /**
   * Watch file
   *
   * @param {String} file
   */
  watch (file) {
    if (!this.files[file] || this.watched[file]) return
    this.watched[file] = true
    fs.watchFile(file, { interval: 250 }, _ => {
      this.reload(file)
      debug('HOT_RELOAD', file)
    })
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

      // Check components
      if (flyConfig.components) {
        for (let name in flyConfig.components) {
          this.addComponent(name, flyConfig.components[name], dir)
        }
        // Merge components for sub fly
        flyConfig.components = { ...config.components, ...flyConfig.components }
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
        this.load(filePath, { component: config.component })
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
   * Add component
   *
   * @param {String} name
   * @param {Object} config
   * @param {String} baseDir
   */
  addComponent (name, config, baseDir) {
    this.components = config
    const componentDir = path.join(baseDir, config.dir)
    debug(`LOAD_COMPONENT: ${name} -> ${componentDir}`)
    return this.add(componentDir, { component: name })
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
    if (typeof event !== 'object') throw new FlyError('illegal event')

    let eventFn
    let fn = typeof name.main === 'function' ? name : this.get(name, initalContext)
    if (!fn) throw new FlyError(`no function to call: ${name}`)

    const chian = []
    let ctx = initalContext || {}

    const eventType = ctx.eventType
    const eventTypeCap = eventType && Utils.ucfirst(eventType)
    if (eventType && fn.events && fn.events[eventType]) {
      eventFn = fn.events[eventType]
    }

    const FNS_BEFORE = eventTypeCap ? FN_EXEC_BEFORE.map(f => f + eventTypeCap).concat(FN_EXEC_BEFORE) : FN_EXEC_BEFORE
    const FNS_AFTER = eventTypeCap ? FN_EXEC_AFTER.map(f => f + eventTypeCap).concat(FN_EXEC_AFTER) : FN_EXEC_AFTER

    // Component function exec
    fn.components && Object.keys(fn.components).forEach(cname => {
      FNS_BEFORE.forEach(key => {
        const fnName = `${cname}@${key}`
        if (this.functions[fnName]) {
          chian.push([(event, ctx) => this.call(fnName, event, Object.assign(ctx)), 'component'])
        }
      })
    })

    FNS_BEFORE.forEach(key => {
      if (key === 'props' && fn.props) {
        chian.push([(event) => Validator.validateEvent(event, fn.props), key])
      } else if (fn[key]) {
        chian.push([fn[key], key])
      }
    })

    // [AFTER] function exec
    FNS_AFTER.forEach(key => fn[key] && chian.push([fn[key], key]))

    // [AFTER] Component function exec
    fn.components && Object.keys(fn.components).forEach(cname => {
      FNS_AFTER.forEach(key => this.functions[`${cname}@${key}`] && chian.push([(event, ctx) => this.call(`${cname}@${key}`, event, ctx), 'component']))
    })

    while (chian.length) {
      // Restore ctx
      const [callee, invokeType] = chian.shift()
      ctx = this.getContext(Object.assign(ctx, fn, { eventType }), event)
      try {
        const ret = await this.invoke(callee, event, Object.assign(ctx, { invokeType }))
        // Only event is object pass as next event
        if (typeof ret === 'object') event = ret
      } catch (err) {
        const callee = (eventFn && eventFn.catch) || fn.catch
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
        trace.name + ':' + trace.invokeType,
        trace.eventType || '●',
        trace.spendTime + 'ms',
        trace.error || '-',
        trace.eventId.split('-').pop()
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
    if (!type) throw new FlyError('event type is requried')
    if (!this.config.customEvents.includes(type)) { throw new FlyError('event type is do not support broadcast') }
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
    if (!ctx.env) ctx.env = this.config.env

    // Event only exists in invoke
    if (!ctx.hasOwnProperty('originalEvent')) ctx.originalEvent = event
    else ctx.parentEvent = event

    // Trace
    ctx.trace = {
      name: ctx.name,
      invokeType: ctx.invokeType || '',
      startTime: Date.now(),
      eventType: ctx.eventType,
      eventId: ctx.eventId
    }

    if (!ctx.call) {
      ctx.call = (name, evt, context) => this.call(name, evt, Object.assign(ctx, { invokeType: '' }, context || {}))
    }
    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.get) ctx.get = name => this.get(name, ctx)

    Object.keys(this.functions).forEach(name => {
      if (ctx[name]) return
      ctx[name] = (evt, context) => this.call(this.get(name), evt, Object.assign(ctx, { invokeType: '', eventType: null }, context || {}))
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
