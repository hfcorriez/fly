const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')
const uuidv4 = require('uuid/v4')
const Client = require('./client')
const debug = require('debug')('fly/lib')

const DEFAULT_OPTIONS = {
  env: process.env.NODE_ENV || 'development',
  ignoreDirNames: ['node_modules'],
  broadcastEvents: ['startup', 'shutdown'],
  dir: process.cwd()
}

class Fly extends EventEmitter {
  constructor(options) {
    super()
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
    if (!name) throw this.error('no name given')
    if (name[0] === '/') {
      return this.files[name]
    }
    let [link, _] = name.split('@')
    let dir = ''
    let subdir = ''
    name = _

    if (!name) {
      name = link
      link = null
    }

    if (name.includes('.')) {
      let nameArr = name.split('.')
      name = nameArr.pop()
      subdir = '/' + nameArr.join('/')
    }

    if (link) {
      if (!ctx.links[link]) throw this.error(`no link ${link} found in ${ctx.file}`)
      dir = ctx.links[link]
    } else {
      dir = this.options.dir
    }

    return this.functions[`${dir}${subdir}:${name}`]
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
      fn.path = path.relative(options.root, file)
      fn.id = Fly.buildFunctionName(fn.path)
      fn.name = fn.name || path.basename(file, '.js')
      fn.main = fn.main.bind(fn)
      fn.before = fn.before ? fn.before.bind(fn) : null
      fn.after = fn.after ? fn.after.bind(fn) : null
      fn.validate = fn.validate ? fn.validate.bind(fn) : null
      fn.file = file
      fn.dir = path.dirname(file)
      Fly.mergeConfigs(fn, options.config)
      this.files[file] = fn

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
    if (!dir) throw this.error('no dir argument passed')
    if (dir[0] !== '/') dir = path.resolve(dir)
    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) throw this.error('not dir or dir not exists: ' + dir)
    options = options || {}

    let config = Object.assign(Fly.getConfig(dir) || {}, options.config || {})
    let files = fs.readdirSync(dir)

    // Set root dir
    let root = options.root || dir

    files.forEach(name => {
      if (name[0] === '.') return
      let file = path.join(dir, name)
      let stat = fs.statSync(file)
      if (stat.isFile() && file.endsWith('.js')) {
        let fn = this.add(file, { config, root })
        if (!fn) return
        /**
         * If load from fn with link
         */
        let key
        key = fn.dir + ':' + fn.name
        if (!this.functions[key]) {
          debug('function place:', key)
          this.functions[key] = fn
        }
      } else if (stat.isDirectory() && !this.options.ignoreDirNames.includes(name)) {
        this.load(file, { root: dir, config })
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
    if (!name) throw this.error('no name to call')

    let targetEvent
    let fn = typeof name.main === 'function' ? name : this.get(name, initalContext)
    let valid = true
    let invokeChian = []
    let validChian = []
    let ctx = initalContext || {}

    if (ctx.eventType && fn.events && fn.events[ctx.eventType]) {
      targetEvent = fn.events[ctx.eventType]
    }

    targetEvent && targetEvent.validate && validChian.push(targetEvent.validate)
    targetEvent && targetEvent.before && invokeChian.push([targetEvent.before, 'before'])
    fn.validate && validChian.push(fn.validate)
    fn.before && invokeChian.push([fn.before, 'before'])
    fn.main && invokeChian.push([fn.main, 'main'])
    fn.after && invokeChian.push([fn.after, 'after'])
    targetEvent && targetEvent.after && invokeChian.push([targetEvent.after, 'after'])

    try {
      while (validChian.length) {
        let callee = validChian.shift()
        ctx = this.getContext(Object.assign(ctx, fn, { type: 'validate' }), event)
        valid = await this.invoke(callee, event, ctx)
        if (!valid) throw this.error(`validate failed: ${fn.name}`)
      }

      while (invokeChian.length) {
        let [callee, type] = invokeChian.shift()
        // Restore ctx
        ctx = this.getContext(Object.assign(ctx, fn, { type }), event)
        event = await this.invoke(callee, event, ctx)
      }
      return event
    } catch (err) {
      this.emit('error', err)
      throw err
    }
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
   * Create error
   *
   * @param {Number} code
   * @param {String} message
   */
  error (message, code) {
    const err = new Error(message)
    err.code = code
    return err
  }

  /**
   * Call function without event match
   *
   * @param {String} main    Function name
   * @param {Object} event
   * @param {Object} ctx
   * @returns {*}
   */
  async invoke (main, event, ctx) {
    ctx = this.getContext(ctx, event)
    const trace = ctx.trace

    let ret

    function call (fn, event, ctx, retries) {
      retries = typeof retries === 'number' ? retries : 1
      try {
        return fn(event, ctx)
      } catch (err) {
        retries--
        if (retries <= 0) {
          throw err
        } else {
          debug('retry with error:', err.message)
          return call(fn, event, ctx, retries)
        }
      }
    }

    try {
      ret = await call(main, event, ctx, ctx.retries || null)
    } catch (err) {
      trace.error = err.message
      this.emit('error', Object.assign(err, { event, ctx }))
      throw err
    } finally {
      trace.spendTime = Date.now() - trace.startTime

      debug([trace.name + ':' + trace.type, trace.eventType || '●', trace.spendTime + 'ms', trace.error || '-', trace.eventId].join(' | '))
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
    if (!type) throw this.error('event type is requried')
    if (!this.options.broadcastEvents.includes(type)) throw this.error('event type is do not support broadcast')
    let functions = this.list(type)
    return Promise.all(functions
      .map(fn => this
        .call(fn.name, event, ctx)
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
    if (!ctx.originalEvent) ctx.originalEvent = event
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
    if (!ctx.broadcast) ctx.broadcast = (type, event, context) => this.broadcast(type, event, Object.assign(ctx, context || {}))

    if (!ctx.link) ctx.link = (name, link) => {
      if (link[0] === '.' || link[0] === '/') {
        return this.link(name, link)
      } else {
        throw this.error('internal link only support directory')
      }
    }

    return ctx
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
