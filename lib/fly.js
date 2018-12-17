const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')
const uuidv4 = require('uuid/v4')
const Client = require('./client')
const utils = require('./utils')
const debug = require('debug')('fly/lib')

const DEFAULT_OPTIONS = {
  env: process.env.NODE_ENV || 'development',
  ignoreDirNames: ['node_modules']
}

class Fly extends EventEmitter {
  constructor(options) {
    super()
    this.functions = {}
    this.clients = {}

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
  get (name, tryService) {
    let [service, _] = name.split('@')
    name = _

    if (!name) {
      name = service
      service = null
    }

    // Try get from service first
    if (tryService && this.functions[tryService] && this.functions[tryService][name]) {
      return this.functions[tryService][name]
    }

    // Load from current app
    if (!service && this.functions._[name]) return this.functions._[name]

    // Load from linked apps
    if (service && this.functions[service] && this.functions[service][name]) return this.functions[service][name]

    return false
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
   * Load dir
   *
   * @param {String} dir
   * @param {String | Null} service
   * @param {Object | Null} options
   */
  load (dir, service, options) {
    if (!dir) throw this.error('no dir argument passed')
    if (dir[0] !== '/') dir = path.resolve(dir)
    let dirStat = fs.existsSync(dir) && fs.statSync(dir)
    if (!dirStat || !dirStat.isDirectory()) throw this.error('not dir or dir not exists: ' + dir)

    let config = Fly.getConfig(dir)
    let files = fs.readdirSync(dir)

    options = options || {}
    if (typeof service === 'object') {
      options = service
      service = null
    }

    const key = service || '_'

    if (!options.subdir) {
      if (this.functions[key]) {
        console.warn('service already exists:', key, dir)
        return
      }
      this.functions[key] = {}
    }

    // Set root dir
    let rootDir = options.root || dir

    files.forEach(fileName => {
      if (fileName[0] === '.') return
      let file = path.join(dir, fileName)
      let stat = fs.statSync(file)
      if (stat.isFile() && file.endsWith('.js')) {
        let fn = this.add(file, service, { config, root: rootDir })
        if (!fn) {
          debug(`ignore load function`, file)
          return
        }

        if (this.functions[key][fn.name]) {
          debug(`duplicate name for ${fn.name}`, file)
          return
        }

        this.functions[key][fn.name] = fn
      } else if (stat.isDirectory() && !this.options.ignoreDirNames.includes(fileName)) {
        this.load(file, service, { root: rootDir, subdir: true })
      }
    })

    // Process links
    if (config && config.links) this.links(config.links, { dir })
  }

  /**
   * Load links
   *
   * @param {Object} links
   * @param {Object} config
   */
  links (links, options) {
    let { config, dir } = options || {}
    Object.keys(links).forEach(service => {
      let link = links[service]
      let options = {
        /**
         * load config from root fly.yml
         *
         * config:
         *  service@:                 // Service name
         *    db: localhost:27017     // Confiuration to overwrite
         */
        config: config && config[service + '@']
      }


      if (link[0] === '.' || link[0] === '/') {
        // Is Dir
        /**
         * If link start with /, it's the absolute file path
         * otherwise if start with "..", it's a relative file path
         */
        link = link[0] === '/' ? link : path.join(dir || this.options.dir, link)
        this.load(link, service, options)
      } else if (/^[a-z0-9@][a-z0-9@\-\/]*[a-z0-9]$/.test(link)) {
        // Is Module
        throw this.error('module link is not support')
      } else if (/^[a-zA-Z0-9][a-zA-Z0-9\-\/]+[a-zA-Z0-9]/.test(link)) {
        // Is Github
        throw this.error('github link is not support')
      } else if (/^git:/.test(link)) {
        // is Git
        throw this.error('git link is not support now')
      } else if (/^https?:/.test(link)) {
        throw this.error('url link is not support')
      }
    })
  }

  /**
   * Load function describer
   *
   * @param {String} file
   * @param {Object} flyConfig
   */
  add (file, service, options) {
    let { config, root } = options || {}

    try {
      let fn = require(file)
      if (typeof fn === 'function') {
        fn = { main: fn }
      } else if (typeof fn.main !== 'function') {
        debug('fail to load function without main', file)
        return false
      }
      Fly.mergeConfigs(fn, config)

      // Process api
      fn.service = service
      fn.path = path.relative(root, file)
      fn.name = fn.name || Fly.buildFunctionName(fn.path)
      fn.id = (fn.service ? (fn.service + '@') : '') + fn.name
      fn.main = fn.main.bind(fn)
      fn.before = fn.before ? fn.before.bind(fn) : null
      fn.after = fn.after ? fn.after.bind(fn) : null
      fn.validate = fn.validate ? fn.validate.bind(fn) : null
      fn.file = file
      fn.dir = path.dirname(file)

      if (fn.links) {
        this.links(fn.links, { dir: fn.dir })
      }
      debug('function load:', fn.id)
      return fn
    } catch (err) {
      debug('function load failed:', err)
      return false
    }
  }

  /**
   * Get functions by event type
   *
   * @param {String} type
   * @returns {Array}
   */
  list (type) {
    let functions = []
    Object.keys(this.functions).forEach(appName => {
      Object.keys(this.functions[appName]).forEach(fnName => {
        let fn = this.functions[appName][fnName]
        if (!type || fn.events && fn.events[type]) {
          functions.push(fn)
        }
      })
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
    event = event || {}

    let targetEvent
    let fn = this.get(name)
    let valid = false
    let chian = []

    const ctx = this.getContext(Object.assign({
      orignalEvent: event,
    }, fn, initalContext))

    if (ctx.eventType) {
      targetEvent = fn.events[ctx.eventType]

      if (targetEvent.validate) {
        valid = await this.invoke(targetEvent.validate, event, Object.assign(ctx, { type: 'validate' }))
        if (!valid) {
          throw this.error(`validate failed for ${ctx.eventType} event: ${fn.name}`)
        }
      }

      targetEvent.before && chian.push([targetEvent.before, 'before'])
    }

    if (fn.validate) {
      valid = await this.invoke(fn.validate, event, Object.assign(ctx, { type: 'validate' }))
      if (!valid) {
        throw this.error(`validate failed for: ${fn.name}`)
      }
    }

    fn.before && chian.push([fn.before, 'before'])
    fn.main && chian.push([fn.main, 'main'])
    fn.after && chian.push([fn.after, 'after'])

    targetEvent && targetEvent.after && chian.push([targetEvent.after, 'after'])

    try {
      while (chian.length) {
        let [callee, type] = chian.shift()
        event = await this.invoke(callee, event, Object.assign(ctx, { type }))
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
    event = event || {}
    ctx = this.getContext(ctx, event)

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
      ctx.trace.error = err.message
      this.emit('error', Object.assign(err, { fn: main, event, ctx }))
      throw err
    } finally {
      ctx.trace.spendTime = Date.now() - ctx.trace.startTime

      debug([
        utils.padding(ctx.id, 26) + utils.padding(ctx.trace.type, '8') + utils.padding('← ' + ctx.eventType || '', '10'),
        utils.padding(ctx.trace.error || '+' + ctx.trace.spendTime + 'ms', 30),
        utils.padding(ctx.eventId || '', 36),
      ].join(' | '))
    }

    return ret
  }

  /**
   * Create context for function
   *
   * @param {Object} initalContext
   */
  getContext (initalContext, event) {
    const ctx = initalContext || {}

    if (event) {
      // Event only exists in invoke
      ctx.parentEvent = event
      ctx.trace = {
        type: ctx.type || '',
        startTime: Date.now()
      }
    }

    if (!ctx.traces) ctx.traces = []
    if (!ctx.eventId) ctx.eventId = uuidv4()

    if (!ctx.call) {
      ctx.call = (name, evt, context) => {
        if (!name) throw this.error('no name to call')
        // Support internal call in service
        let fn = this.get(name, ctx.service)
        if (!fn) {
          throw this.error(`call internal function failed: ${name}`, 101)
        }
        return this.invoke(fn.main, evt || {}, Object.assign(ctx, context || {}, fn, {
          type: '',
          callerName: ctx.trace.id
        }))
      }
    }

    if (!ctx.list) ctx.list = this.list.bind(this)
    if (!ctx.get) ctx.get = this.get.bind(this)
    if (!ctx.link) ctx.link = (link, service) => {
      if (link[0] === '.' || link[0] === '/') {
        this.links({ [service]: link })
      } else {
        throw this.error('intercal add link only support directory')
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
      Object.keys(fn.events).forEach(event => {
        if (!flyConfig.events || flyConfig.events[event]) return
        Fly.mergeConfig(fn.events[event], flyConfig.events[event])
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
      let envFile = path.join(dir, `fly.${this.runtime.env}.yml`)
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
