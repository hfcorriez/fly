const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const Client = require('./client')
const debug = require('debug')('fly/lib')
const FN_RESERVE_KEYS = ['config', 'before', 'after', 'validate', 'catch']
const FN_DEFINE_REGEX = new RegExp(`^(${FN_RESERVE_KEYS.join('|')})([a-zA-Z]+)`)

const DEFAULT_OPTIONS = {
  env: process.env.NODE_ENV || 'development',
  ignoreDirNames: ['node_modules'],
  broadcastEvents: ['startup', 'shutdown'],
  dir: process.cwd()
}

class Fly {
  constructor(options) {
    this.clients = {}
    this.dirs = {}
    this.files = {}
    this.functions = {}

    if (typeof options === 'string') {
      options = { dir: options }
    }

    this.options = Object.assign({}, DEFAULT_OPTIONS, options || {})
    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    debug('fly with', this.options.dir)
    this.load(this.options.dir)
  }

  /**
   * Get function from
   *
   * - function
   * - module@function
   *
   * @param {String} name
   */
  get (name, ctx) {
    if (!name) throw Fly.error('no name given')
    if (name[0] === '/') {
      return this.files[name]
    }
    let [link, _] = name.split('@')
    let dir = ''
    name = _
    if (!name) {
      name = link
      link = null
    }

    if (link) {
      if (!ctx.links[link]) throw Fly.error(`no link ${link} found in ${ctx.file}`)
      dir = ctx.links[link]
    } else {
      dir = this.options.dir
    }

    return this.functions[`${dir}:${name}`]
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
  add (file, options) {
    try {
      let fn = this.files[file]
      if (fn) return fn

      fn = require(file)
      if (fn.toString().startsWith('class ')) {
        debug('function is class not support')
        return false
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function') {
        debug('function no main entry', file)
        return false
      }

      // Process api
      fn.path = path.relative(this.options.dir, file)
      fn.name = fn.name || path.basename(file, '.js')
      fn.main = fn.main.bind(fn)
      fn.before = fn.before ? fn.before.bind(fn) : null
      fn.after = fn.after ? fn.after.bind(fn) : null
      fn.validate = fn.validate ? fn.validate.bind(fn) : null
      fn.file = file
      fn.dir = path.dirname(file)
      fn.root = options.root
      fn.events = fn.events || {}
      fn.catch = (fn.error || fn.catch) ? (fn.error || fn.catch).bind(this) : null

      Object.keys(fn).forEach(key => {
        const matched = key.match(FN_DEFINE_REGEX)
        if (!matched) return

        const type = matched[1].toLowerCase()
        const event = matched[2].toLowerCase()

        fn.events[event] = Object.assign(
          fn.events[event] || {},
          type === 'config' ? fn[key] : { [type]: fn[key].bind(fn) }
        )
        delete fn[key]
      })

      Fly.mergeConfigs(fn, options.config)
      this.files[file] = fn

      let key
      key = options.root + ':' + fn.name
      if (!this.functions[key]) {
        debug('function place:', key)
        this.functions[key] = fn
      }

      // Fix links
      if (fn.links) {
        this.links(fn.links, { fn, dir: fn.dir })
      }

      debug('function load:', file)
      return fn
    } catch (err) {
      debug('function load failed:', err)
      return false
    }
  }

  /**
   * Load dir
   *
   * @param {String} dir
   * @param {String | Null} dir
   * @param {Object | Null} options
   */
  load (dir, options) {
    if (!dir) throw Fly.error('no dir argument passed')
    if (dir[0] !== '/') dir = path.resolve(dir)
    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) throw Fly.error('not dir or dir not exists: ' + dir)
    options = options || {}

    let config = Object.assign(Fly.getConfig(dir) || {}, options.config || {})
    let files = fs.readdirSync(dir)

    // Set root dir
    let rootDir = options.root || dir

    files.forEach(name => {
      if (name[0] === '.') return
      let file = path.join(dir, name)
      let stat = fs.statSync(file)
      if (stat.isFile() && file.endsWith('.js')) {
        this.add(file, { config, root: rootDir })
      } else if (stat.isDirectory() && !this.options.ignoreDirNames.includes(name)) {
        this.load(file, { root: rootDir, config })
      }
    })

    // Process links
    if (config && config.links) {
      this.links(config.links, { dir, config: config && config[options.link + '@'] })
    }

    return true
  }

  /**
   * Add to links
   *
   * @param {Object} links
   * @param {Object} options
   */
  links (links, options) {
    Object.keys(links).forEach(name => {
      let link = links[name]
      if (link[0] === '/' || link[0] === '.') {
        links[name] = link[0] === '/' ? link : path.join(options.dir || this.options.dir, link)
      }
      this.link(name, Object.assign(options || {}, { path: links[name] }))
    })
  }

  /**
   * Load links
   *
   * @param {Object} links
   * @param {Object} options
   */
  link (name, options) {
    if (typeof options === 'string') {
      options = { path: options }
    }
    options = options || {}
    if (options.path[0] === '.' || options.path[0] === '/') {
      // Is Dir
      /**
       * If link start with /, it's the absolute file path
       * otherwise if start with "..", it's a relative file path
       */
      return this.load(
        options.path,
        Object.assign(options, { link: name })
      )
    } else if (/^[a-z0-9@][a-z0-9@\-\/]*[a-z0-9]$/.test(options.path)) {
      // Is Module
      debug('module link is not support')
    } else if (/^[a-zA-Z0-9][a-zA-Z0-9\-\/]+[a-zA-Z0-9]/.test(options.path)) {
      // Is Github
      debug('github link is not support')
    } else if (/^git:/.test(options.path)) {
      // is Git
      debug('git link is not support now')
    } else if (/^https?:/.test(options.path)) {
      debug('url link is not support')
    }
    return false
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
      if (type && (!this.functions[id].events || !this.functions[id].events[type])) return

      // Push to function
      !functions.includes(this.functions[id]) && functions.push(this.functions[id])
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
    if (!name) throw Fly.error('no name to call')

    let targetEvent
    let fn = typeof name.main === 'function' ? name : this.get(name, initalContext)
    if (!fn) throw Fly.error(`no function to call: ${name}`)

    let chian = []
    let ctx = initalContext || {}

    if (ctx.eventType && fn.events && fn.events[ctx.eventType]) {
      targetEvent = fn.events[ctx.eventType]
    }

    targetEvent && targetEvent.validate && chian.push([targetEvent.validate, 'validate', 'event'])
    targetEvent && targetEvent.before && chian.push([targetEvent.before, 'before', 'event'])
    fn.validate && chian.push([fn.validate, 'validate'])
    fn.before && chian.push([fn.before, 'before'])
    fn.main && chian.push([fn.main, 'main'])
    fn.after && chian.push([fn.after, 'after'])
    targetEvent && targetEvent.after && chian.push([targetEvent.after, 'after', 'event'])

    while (chian.length) {
      let [callee, type, obj] = chian.shift()
      // Restore ctx
      ctx = this.getContext(Object.assign(ctx, fn, { type }), event)
      try {
        let ret = await this.invoke(callee, event, ctx)
        if (type === 'validate') {
          if (!ret) throw Fly.error(`"${fn.name}" validate failed`)
        } else {
          event = ret
        }
      } catch (err) {
        callee = obj === 'event' ? (targetEvent.catch || fn.catch) : fn.catch
        if (!callee) throw err
        event = err
        ctx = this.getContext(Object.assign(ctx, fn, { type }), event)
        return await this.invoke(callee, event, ctx)
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

    ctx.leftRetries = parseInt(ctx.leftRetries || 1, 10)

    try {
      ret = await fn(event, ctx)
    } catch (err) {
      trace.error = err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
      debug([trace.name + ':' + trace.type, trace.eventType || '●', trace.spendTime + 'ms', trace.error || '-', trace.eventId].join(' | '))
    }

    if (trace.error) {
      ctx.leftRetries--
      if (ctx.leftRetries <= 0) {
        throw trace.error
      } else {
        debug('retry with error:', trace.error.message)
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
    if (!type) throw Fly.error('event type is requried')
    if (!this.options.broadcastEvents.includes(type)) throw Fly.error('event type is do not support broadcast')
    let functions = this.list(type)
    return Promise.all(functions
      .map(fn => this
        .call(fn, event, ctx)
        .catch(err => debug(`broadcast ${fn.name} failed: ${err.message}`))
      )
    )
  }

  /**
   * Create context for function
   *
   * @param {Object} initalContext
   */
  getContext (initalContext, event) {
    const ctx = initalContext || {}

    if (!ctx.eventId) ctx.eventId = uuidv4()

    // Event only exists in invoke
    if (!ctx.hasOwnProperty('originalEvent')) ctx.originalEvent = event
    else ctx.parentEvent = event

    ctx.trace = {
      name: ctx.name,
      type: ctx.type || '',
      startTime: Date.now(),
      eventType: ctx.eventType,
      eventId: ctx.eventId
    }

    if (!ctx.call) {
      ctx.call = (name, evt, context) => {
        return this.call(name, evt, Object.assign(ctx, { type: '', }, context || {}))
      }
    }
    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.get) ctx.get = (name) => this.get(name, ctx)
    return ctx
  }

  /**
   * Create error
   *
   * @param {Number} code
   * @param {String} message
   */
  static error (message, code) {
    const err = new Error(message)
    err.code = code || 1
    return err
  }

  /**
   *
   * @param {String} file
   * @param {String} dir
   */
  static buildFunctionName (filePath) {
    return filePath
      .replace(/\//g, '.')
      .replace(/\.js$/, '')
      .replace(/[\-_]([a-z])/g, (_, word) => word.toUpperCase())
  }

  /**
   * Merge config
   *
   * @param {Object} config
   * @param {Object} flyConfig
   */
  static mergeConfig (config, flyConfig) {
    if (!config || !flyConfig) return config || {}

    let finalConfig = {}
    Object.keys(flyConfig).forEach(key => {
      if (key[0] !== '@') {
        config[key] = flyConfig[key]
      } else if (key === `@${name}`) {
        finalConfig = flyConfig[key]
      }
    })
    Object.assign(config, finalConfig)
    return config
  }

  /**
   * Merge configs
   *
   * @param {Object} fn
   * @param {Object} flyConfig
   */
  static mergeConfigs (fn, flyConfig) {
    flyConfig = flyConfig || {}
    fn.config = Fly.mergeConfig(fn.config, flyConfig.config)
    fn.links = Fly.mergeConfig(fn.links, flyConfig.links)
    if (fn.events) {
      Object.keys(fn.events).forEach(type => {
        if (!flyConfig.events || !flyConfig.events[type]) return
        Fly.mergeConfig(fn.events[type], flyConfig.events[type])
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
  static getConfig (dir) {
    let config

    try {
      config = yaml.safeLoad(fs.readFileSync(path.join(dir, 'fly.yml'), 'utf8'))
      let envFile = path.join(dir, `fly.${this.options.env}.yml`)
      if (fs.existsSync(envFile)) {
        let envConfig = yaml.safeLoad(fs.readFileSync(envFile, 'utf8'))
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
      //debug('fly.yml load failed', dir)
    }

    return config
  }
}

module.exports = Fly
