const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const micromatch = require('micromatch')
const colors = require('colors/safe')
const Utils = require('./utils')
const Validator = require('./validator')
const { FlyError } = require('./error')
const Debug = require('debug')
const chokidar = require('chokidar')
const callerId = require('caller-id')

const FN_EXEC_BEFORE = ['before', 'props', 'validate', 'main']
const FN_EXEC_AFTER = ['after']
const FN_RESERVE_KEYS = FN_EXEC_BEFORE.concat(FN_EXEC_AFTER).concat(['config', 'catch'])
const FN_RESERVE_REGEX = new RegExp(
  `^(${FN_RESERVE_KEYS.join('|')})([a-zA-Z]+)`
)
const DEBUG_COLORS = { fatal: 1, error: 9, warn: 3, info: 4, debug: 8 }
const CTX_RESERVED_KEYS = ['eventId', 'eventType', 'parentEvent', 'originalEvent', 'fly', 'log', '_init']

let info, debug, warn, error

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
    this.mounts = {}
    this.imports = {}
    this.ctxGroups = {}

    if (typeof config === 'string') {
      config = { dir: config }
    } else if (!config) {
      config = {}
    }

    this.config = { project: { ...DEFAULT_PROJECT_CONFIG, ...config } }
    this.config.project.dir = path.resolve(this.config.project.dir)
    if (!this.config.project.name) {
      this.config.project.name = this.config.project.dir.split('/').pop()
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
    // Process mounts
    Object.keys(this.config.project.mounts).forEach(key => {
      if (!this.mounts[key]) this.mounts[key] = []
      const dir = this.config.project.mounts[key]
      this.mounts[key].push(dir)
    })

    // Merge ignore
    this.config.project.ignore = this.config.project.defaultIgnore.concat(this.config.project.ignore || [])

    // Inject the main service
    info('bootstrap:', JSON.stringify({ dir: this.config.project.dir, name: this.config.project.name, env: this.config.project.env }))

    const flyConfig = this.loadConfig()

    // Only mount root with fly.yml
    if (flyConfig) {
      this.mount(this.config.project.dir)
    }

    // Mount all dirs
    Object.keys(this.mounts).forEach(prefix => {
      this.mounts[prefix].forEach(dir => this.mount(dir, prefix))
    })
  }

  /**
   * Load config
   */
  loadConfig () {
    debug('load config for:', this.config.project.dir, this.config.project.env)
    const flyConfig = Fly.GetConfig(this.config.project.dir, this.config.project.env)

    // Using fly config
    if (flyConfig) {
      Object.assign(this.config.project, flyConfig.project || {})
      delete flyConfig.project
      Object.assign(this.config, flyConfig)

      // Load ignore
      if (flyConfig.project && flyConfig.project.ignore) {
        flyConfig.project.ignore.forEach(item => {
          if (this.config.project.ignore.includes(item)) return
          this.config.project.ignore.push(item)
        })
      }
    }

    return flyConfig
  }

  /**
   * Mount dir
   *
   * @param {String} dir
   * @param {String} prefix
   */
  mount (dir, prefix) {
    info('mount', dir, prefix)
    this.add(dir, { prefix })
    this.prepare(dir, prefix)
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
    debug('get fn:', name)
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
    info('config overwrite:', name, event, config)
    return true
  }

  /**
   * Load function describer
   *
   * @param {String} file
   * @param {Object} flyConfig
   */
  load (file, options) {
    const { force, prefix = '', root = this.config.project.dir } = options || {}

    try {
      const config = this.config
      const { dir, ext, ignore } = config.project
      const filePath = path.relative(root, file)

      if (!ext.some(e => file.endsWith('.' + e))) {
        debug('ignore by ext:', file)
        return
      } else if (micromatch.any(filePath, ignore, { basename: true })) {
        debug('ignore by rule:', file)
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
        warn('no main entry:', file)
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
      fn.root = root
      fn.events = fn.events || {}
      fn.chain = {}

      const testFilepath = file.replace(/\.js$/, '.test.js')
      if (fs.existsSync(testFilepath)) {
        fn.test = testFilepath
      }

      this.parseEvents(fn)

      this.files[file] = fn
      this.functions[fn.name] = fn

      // Config overwrite with fly.yml
      Object.keys(fn.events).forEach(event => {
        if (config[event] && config[event][fn.name]) Object.assign(fn.events[event], config[event][fn.name])
      })

      // Extends the function if function exists
      if (force && fn.extends) {
        debug('try extend:', fn.name)
        this.extend(fn.name, true)
      }

      debug('load fn ok:', fn.name)
      return fn
    } catch (err) {
      warn('load fn error:', err)
      Fly.OutputWarning('load fn error', `ignore ${file}`, err.message)
      return false
    }
  }

  /**
   * Parse function events
   *
   * @param {Object} fn
   */
  parseEvents (fn) {
    Object.keys(fn).forEach(key => {
      const matched = key.match(FN_RESERVE_REGEX)
      if (!matched) return

      const type = matched[1].toLowerCase()
      const event = matched[2].toLowerCase()

      fn.events[event] = Object.assign(
        fn.events[event] || {},
        type === 'config' ? typeof fn[key] === 'function' ? fn[key]() : fn[key] : { [type]: fn[key] }
      )
    })

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

    info('reload fn:', name)
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
    info('delete fn:', name)
    delete this.files[fn.file]
    delete this.functions[name]
    if (fn.extends && this.extends[fn.extends]) {
      this.extends[fn.extends].splice(this.extends[fn.extends].indexOf(name), 1)
    }
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
  add (dir, { prefix, root }) {
    debug('add dir', dir)
    if (!dir) {
      throw new FlyError('no dir argument')
    }

    root = root || dir
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
      let relativePath = path.relative(root, filePath)

      if (isFile) {
        this.load(filePath, { prefix, root })
      } else if (
        stat.isDirectory() &&
        // force ignore node_modules
        file !== 'node_modules' &&
        // Ignore hidden folders
        !file.startsWith('.')
      ) {
        const isAdd = !micromatch.any(relativePath + '/_', config.project.ignore)
        if (!isAdd) {
          debug('ignore dir:', filePath)
          return
        }
        this.add(filePath, { prefix, root })
      }
    })

    return true
  }

  /**
   *
   * @param {String} dir
   */
  prepare (dir, prefix) {
    info('perpare:', dir, prefix)

    // Process extends
    Object.keys(this.functions).forEach(name => {
      if (prefix && !name.startsWith(prefix)) return
      if (!this.functions[name].extends) return
      this.extend(name)
    })

    if (this.config.project.hotreload && !this.isWatching) {
      this.isWatching = true
      info('hotreload watch:', dir)
      chokidar.watch(dir, { ignoreInitial: true, ignored: /(^|[/\\])\../ }).on('all', (event, file) => {
        info('hotreload event:', event, file)
        if (event === 'add' && this.files[file]) event = 'change'
        const filename = file.split('/').pop()
        switch (event) {
          case 'change':
            if (this.imports[file]) {
              this.import(file, true)
            } else if (this.files[file]) {
              this.reload(this.files[file].name)
            } else if (filename.startsWith('fly.') && filename.endsWith('.yml')) {
              this.loadConfig()
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
      warn(`extends not found: ${from}`)
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
    info(`extend ${colors.bold(name)} from ${colors.bold(from)}`)
    this.parseEvents(fn)
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

    let fn = name.events ? name : this.get(name)
    if (!fn) throw new FlyError(`no function to call: ${name}`)

    const ctx = initalContext || {}
    const chain = this.parseChain(fn, ctx)
    const keys = Object.keys(chain)
    info('ready chain:', colors.bold(`(${ctx.eventType || '-'})${fn.name}`), keys.join(' > '))

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

    const eventTypeCap = eventType && Utils.ucfirst(eventType)
    const eventFn = ctx.eventType && fn.events[ctx.eventType] ? fn.events[ctx.eventType] : null
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
    debug('invoke start:', colors.bold(`${fn.name}:${invokeType}`), JSON.stringify(event))
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
        colors.bold(`(${trace.eventType || '-'})${trace.name}:${invokeType}`),
        trace.spendTime + 'ms',
        trace.error ? `[${trace.error.name}] ${trace.error.stack}` : 'OK',
        colors.grey(trace.eventId.split('-').pop() || '-')
      ].join(' ')
      trace.error ? warn('invoke fail:', traceInfo) : info('invoke ok:', traceInfo)
    }

    if (trace.error) {
      --ctx.leftRetries
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        error('retry failed after', ctx.retry, 'times')
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
    if (!this.config.project.systemEvents.includes(type)) { throw new FlyError('event type is do not support broadcast') }
    return Promise.all(
      this.list(type).map(fn => this.call(fn, event, ctx).catch(err =>
        info(`broadcast error: ${fn.name} ${err.message}`)
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
      Fly.Logger(this.config.project.name, level, fn.name)(...args, colors.grey(`(${ctx.eventId})`))
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
        call: this.buildCaller(({ fn, args: [ name, evt, context, isolated ] }) => {
          isolated = isolated || context === true
          if (isolated) {
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

    if (ctx._init !== fn.prefix) {
      ctx._init = fn.prefix
      debug('process ctx for:', fn.prefix)

      // Clear context
      Object.keys(ctx).forEach(key => {
        if (CTX_RESERVED_KEYS.includes(key)) return
        delete ctx[key]
      })

      // Assign ctx
      Object.assign(ctx, this.getCtxGroup(fn.prefix, ctx))
    }

    return ctx
  }

  /**
   * Get ctx cache
   *
   * @param {String} prefix
   */
  getCtxGroup (prefix, ctx) {
    let ctxGroup = this.ctxGroups[prefix]
    if (!ctxGroup) {
      debug('init ctx for:', prefix)

      ctxGroup = {}

      // Apply fly.yml config to ctx
      Object.keys(this.config).forEach(key => {
        if (!ctxGroup[key]) ctxGroup[key] = this.config[key]
      })

      Object.keys(this.functions).forEach(key => {
        if (prefix && !key.startsWith(prefix)) return
        ctxGroup[key.substr(prefix.length)] = (evt, context) => this.call(key, evt, Object.assign(ctx, {
          originEventType: ctx.eventType,
          eventType: null,
          ...context
        }))
      })

      /**
      * Process imports
      */
      Object.keys(this.config.project.import).forEach(key => {
        debug('import', key, this.config.project.import[key])
        const filePath = path.join(this.config.project.dir, this.config.project.import[key])
        ctxGroup[key] = this.import(filePath)
      })

      this.ctxGroups[prefix] = ctxGroup
    }

    return ctxGroup
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
    let config = null
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
      Fly.OutputWarning('config load failed:', err.message, dir)
    }

    return config
  }
}

info = Fly.Logger('fly', 'info', 'core')
debug = Fly.Logger('fly', 'debug', 'core')
error = Fly.Logger('fly', 'error', 'core')
warn = Fly.Logger('fly', 'warn', 'core')

module.exports = Fly
