const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const Client = require('./client')
const debug = require('debug')('fly/lib')
const debugMock = require('debug')('TEST:MOCK')
const micromatch = require('micromatch')
const colors = require('colors/safe')
const utils = require('./utils')
const util = require('util')
const EventEmitter = require('events')
const { setMocks } = require('./mock/http')

const ROOT_DIR = path.join(__dirname, '../')
const FN_RESERVE_KEYS = ['config', 'before', 'after', 'validate', 'catch']
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
      'public/**'
    ]
  },
  broadcastEvents: ['startup', 'shutdown', 'error'],
  dir: process.cwd(),
  force: false
}
let mockHandler
const MOCK_FN_NOT_MATCH = Symbol('mock_fn_not_match')
const MOCK_FN_TIMEOUT = Symbol('mock_fn_timeout')

class Fly {
  constructor (options) {
    this.clients = {}
    this.dirs = {}
    this.files = {}
    this.functions = {}
    this.extends = {}
    this.ignores = []

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
    if (!name) throw Fly.Error('no name given')
    if (name[0] === '/') {
      return this.files[name]
    }
    let dir = this.options.dir
    return this.functions[`${dir}:${name}`]
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
      const config = this.dirs[dir] || {}
      const root = this.options.dir
      const ext = config.ext || this.options.config.ext

      if (!ext.some(e => file.endsWith('.' + e))) {
        debug('IGNORED_BY_EXT', file)
        return
      } else if (micromatch.any(file, this.ignores)) {
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
        throw Fly.Error('class is not support')
      }

      if (fn.extends) {
        let resolvedObj = this.resolve(fn.extends, { dir: path.dirname(file) })
        if (!resolvedObj || !resolvedObj.file) { throw Fly.Error(`extends "${fn.extends}" error: ${file}`) }
        fn = Object.assign({}, require(resolvedObj.file), fn)
        if (!this.extends[resolvedObj.file]) { this.extends[resolvedObj.file] = [] }
        this.extends[resolvedObj.file].push(file)
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function') {
        debug('NO_MAIN', file)
        throw Fly.Error('no main entry')
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
      fn.catch =
        fn.error || fn.catch ? (fn.error || fn.catch).bind(this) : null

      if (fn.imports) {
        Object.keys(fn.imports).forEach(name => {
          const resolveObj = this.resolve(fn.imports[name], { dir: fn.dir })
          if (!resolveObj || !resolveObj.file) { throw Fly.Error(`cannot resolve function "${name}" in ${fn.file}`) }
          fn.imports[name] = resolveObj.file
        })
      }

      Object.keys(fn).forEach(key => {
        const matched = key.match(FN_DEFINE_REGEX)
        if (!matched) return

        const type = matched[1].toLowerCase()
        const event = matched[2].toLowerCase()

        fn.events[event] = Object.assign(
          fn.events[event] || {},
          type === 'config'
            ? (typeof fn[key] === 'function' ? fn[key]() : fn[key]) || {}
            : {
              [type]: fn[key].bind(fn)
            }
        )
        // fn[key] = fn[key].bind(fn)
      })

      Fly.MergeConfigs(fn, config)

      let key = root + ':' + fn.name
      this.files[file] = fn
      this.functions[key] = fn

      debug('FN_LOAD', file, key)
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
    delete this.functions[`${this.options.dir}:${fn.name}`]
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
    if (!dir) throw Fly.Error('no dir argument passed')
    if (dir[0] !== '/') dir = path.resolve(dir)
    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) { throw Fly.Error('not dir or dir not exists: ' + dir) }

    options = options || {}

    let config
    if (this.dirs[dir]) {
      config = this.dirs[dir]
    } else {
      let flyConfig = Fly.GetConfig(dir, this.options.env)
      if (
        !flyConfig &&
        dir === this.options.dir &&
        !this.options.force &&
        !this.options.dir.startsWith(ROOT_DIR)
      ) {
        debug('can not load dir without fly.yml')
        return false
      }
      config = this.dirs[dir] = Object.assign(
        options.config || {},
        flyConfig || {}
      )

      if (flyConfig) {
        config.flyDir = dir
        if (flyConfig.ignore) {
          flyConfig.ignore.forEach(pattern => {
            const filePattern = path.join(dir, pattern)
            if (!this.ignores.includes(filePattern)) {
              this.ignores.push(filePattern)
              debug('IGNORE_RULE', filePattern)
            }
          })
        }
      }
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
        (!config.ignore || !micromatch.any(path.join(filePath, '_'), this.ignores))
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
  list (type, rootOnly) {
    let functions = []
    Object.keys(this.functions).forEach(id => {
      let [pos, name] = id.split(':')

      // Not-root link function will ignore
      if (!pos.startsWith(this.options.dir + ':') && name.includes('@')) return

      // non-root functions will ignore by param
      if (rootOnly && !pos.startsWith(this.options.dir + ':')) return

      // Ignore no events
      if (
        type &&
        (!this.functions[id].events || !this.functions[id].events[type])
      ) { return }

      // Push to function
      !functions.includes(this.functions[id]) &&
        functions.push(this.functions[id])
    })
    return functions
  }

  /**
   * Process function chains with event
   *
   * @param {String} fn
   * @param {Object} event
   */
  async call (name, event, initialContext) {
    if (!name) throw Fly.Error('no name to call')

    let targetEvent
    let fn =
      typeof name.main === 'function' ? name : this.get(name, initialContext)
    if (!fn) throw Fly.Error(`no function to call: ${name}`)

    let chian = []
    let ctx = initialContext || {}
    const eventType = ctx.eventType

    if (eventType && fn.events && fn.events[eventType]) {
      targetEvent = fn.events[eventType]
    }
    if (this.options.env === 'test' && mockHandler) {
      const data = await mockHandler.invoke(fn, event, ctx)
      if (!data) {
        throw new Error(`Fatal Mock Error ${fn.name}`)
      }
      if (data === MOCK_FN_NOT_MATCH) {
        debugMock(`no match mock: ${fn.name}`)
      } else if (data === MOCK_FN_TIMEOUT) {
        debugMock(`call mock fn timeout: ${fn.name}`)
      } else if (data.error) {
        throw new Error(data.error)
      } else if (data.event) {
        return data.event
      } else {
        throw new Error(`Fatal Mock Error, ${data}`)
      }
    }
    targetEvent &&
      targetEvent.validate &&
      chian.push([targetEvent.validate, 'validate', 'event'])
    targetEvent &&
      targetEvent.before &&
      chian.push([targetEvent.before, 'before', 'event'])
    fn.validate && chian.push([fn.validate, 'validate'])
    fn.before && chian.push([fn.before, 'before'])
    fn.main && chian.push([fn.main, 'main'])
    fn.after && chian.push([fn.after, 'after'])
    targetEvent &&
      targetEvent.after &&
      chian.push([targetEvent.after, 'after', 'event'])

    while (chian.length) {
      let [callee, type] = chian.shift()

      // Restore ctx
      ctx = this.getContext(Object.assign(ctx, fn, { type, eventType }), event)
      try {
        let ret = await this.invoke(callee, event, ctx)
        if (type === 'validate') {
          if (!event) throw Fly.Error(`"${fn.name}" validate failed`)
        } else {
          event = ret
        }
      } catch (err) {
        callee = (targetEvent && targetEvent.catch) || fn.catch
        if (!callee) {
          this.error(err)
          throw err
        }
        ctx = this.getContext(
          Object.assign(ctx, fn, { type, eventType }),
          event
        )
        event = await this.invoke(callee, err, ctx)
        return event
      }
    }

    return event
  }

  /**
   * Client
   * @param {String | Object} options
   */
  client (options) {
    let key = JSON.stringify(options)
    if (!this.clients[key]) {
      this.clients[key] = new Client(options)
    }
    return this.clients[key]
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
      debug(
        [
          trace.name + ':' + trace.type,
          trace.eventType || '●',
          trace.spendTime + 'ms',
          trace.error || '-',
          trace.eventId
        ].join(' | ')
      )
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
    if (!type) throw Fly.Error('event type is required')
    if (!this.options.broadcastEvents.includes(type)) { throw Fly.Error('event type is do not support broadcast') }
    let functions = this.list(type)
    return Promise.all(
      functions.map(fn =>
        this.call(fn, event, ctx).catch(err =>
          debug(`BROADCAST_ERROR ${fn.name} ${err.message}`)
        )
      )
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
      ctx.call = (name, evt, context) => {
        return this.call(
          name,
          evt,
          Object.assign(ctx, { type: '' }, context || {})
        )
      }
    }
    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.get) ctx.get = name => this.get(name, ctx)

    if (ctx.imports && Object.keys(ctx.imports).length) {
      Object.keys(ctx.imports).forEach(name => {
        ctx[name] = (evt, context) => {
          return this.call(
            this.get(name),
            evt,
            Object.assign(ctx, { type: '', eventType: null }, context || {})
          )
        }
      })
    }
    ctx.error = this.error.bind(this)

    return ctx
  }

  /**
   *
   * @param {Error|Object} err
   */
  error (err) {
    if (typeof err === 'undefined') {
      return
    }
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
      colors.bgRed(utils.padding(type, 12)),
      error ? colors.red(error) : '',
      info
    )
  }

  /**
   * Create error
   *
   * @param {Number} code
   * @param {String} message
   * @param {String} type
   */
  static Error (message, code, type) {
    const err = new Error(message)
    err.type = type ? type.toUpperCase() : ''
    err.code = code || 1
    return err
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
    fn.imports = Fly.MergeConfig(fn.imports, dirConfig.functions, fn.name)
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

class MockHandler {
  constructor () {
    this.fnNames = new Set()
    this.libFiles = []
    this.events = new EventEmitter()
    process.on('message', data => {
      debugMock('http receive data', data)
      if (data.type === 'MOCK') {
        if (data.name === '_setMocks') {
          if (data.event) { // add lib mock
            const { flyFns, libFiles } = setMocks(data.event)
            this.fnNames = flyFns
            this.libFiles = libFiles
          } else {
            setMocks('', this.libFiles)
            this.fnNames = new Set()
            this.libFiles = []
          }
          process.send({ type: 'MOCK', name: '_setMocks', event: 'OK' })
        } else {
          this.events.emit(data.name, data)
        }
      }
    })
  }

  async invoke (fn, event, ctx) {
    debugMock('try invoke: ', fn.name)
    if (!this.fnNames.has(fn.name)) {
      return MOCK_FN_NOT_MATCH
    }
    debugMock('invoke: ', fn.name, JSON.stringify(event))
    process.send({ type: 'MOCK', name: fn.name, event })
    return new Promise(resolve => {
      let id = setTimeout(() => {
        this.events.removeListener(fn.name, resolve)
        resolve(MOCK_FN_TIMEOUT)
      }, 2000)
      this.events.once(fn.name, data => {
        clearTimeout(id)
        resolve(data)
      })
    })
  }
}

if (process.env.NODE_ENV === 'test') {
  mockHandler = new MockHandler()
}
module.exports = Fly
