const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const os = require('os')
const EventEmitter = require('events')
const uuidv4 = require('uuid/v4')
const utils = require('./utils')
const debug = require('debug')('fly/service/lib')
const FLY_HOME = path.join(os.homedir(), '.fly')

class Fly extends EventEmitter {
  constructor(options) {
    super()
    this.runtime = {}
    this.options = {}

    if (typeof options === 'string') {
      this.options.dir = options
    } else if (typeof options === 'object') {
      this.options = options
    }

    // ENSURE HOME IS EXISTS
    if (!fs.existsSync(FLY_HOME)) fs.mkdirSync(FLY_HOME)

    this.bootstrap()
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Generate the runtime
    this.runtime = Fly.getRuntime(this.options.dir)

    // Inject the main service
    this.functions._ = this.load(this.runtime.dir)
  }

  /**
   * Add other functions
   *
   * @param {String} dir
   */
  add (name, dir) {
    let service = this.load(dir)
    this.functions[name] = service
    return service
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
    let [appName, fnName] = name.split('@')

    if (!fnName) {
      fnName = appName
      appName = null
    }

    // Load from current app
    if (!appName && this.functions._[fnName]) return this.functions._[fnName]

    // Load from linked apps
    if (appName && this.functions[appName] && this.functions[appName][fnName]) return this.functions[appName][fnName]

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
   * @param {String | Null} root
   */
  load (dir, root, functions) {
    let flyConfig = this.loadFlyConfig(dir)
    let files = fs.readdirSync(dir)
    root = root || dir
    functions = functions || {}

    files.forEach(fileName => {
      let file = path.join(dir, fileName)
      let stat = fs.statSync(file)
      if (stat.isFile() && file.endsWith('.js')) {
        let fn = this.loadFunction(file, flyConfig, root)
        if (!fn) {
          console.error(`ignore load function`, file)
          return
        }

        if (functions[fn.name]) {
          console.error(`duplicate name for ${fn.name}`, file)
          return
        }

        functions[fn.name] = fn
      } else if (stat.isDirectory()) {
        this.load(file, root, functions)
      }
    })

    return functions
  }

  /**
   * Load fly.yml from dir
   *
   * @param {String} dir
   */
  loadFlyConfig (dir) {
    let flyConfig

    try {
      flyConfig = yaml.safeLoad(fs.readFileSync(path.join(dir, 'fly.yml'), 'utf8'))
      let envFile = path.join(dir, `fly.${this.runtime.env}.yml`)
      if (fs.existsSync(envFile)) {
        let envConfig = yaml.safeLoad(fs.readFileSync(envFile, 'utf8'))
        if (envConfig) {
          Object.keys(envConfig).forEach(key => {
            if (typeof flyConfig[key] === 'object') {
              flyConfig[key] = Object.assign(flyConfig[key], envConfig[key])
            } else {
              flyConfig[key] = envConfig[key]
            }
          })
        }
      }
    } catch (err) {
      console.warn('fly.yml load failed', dir)
    }

    return flyConfig
  }

  /**
   * Load function describer
   *
   * @param {String} file
   * @param {Object} flyConfig
   */
  loadFunction (file, flyConfig, dir) {
    let fn
    try {
      fn = require(file)
      if (typeof fn === 'function') {
        fn = { main: fn, name: this.buildFunctionName(file, dir) }
      } else if (typeof fn.main !== 'function') {
        throw new Error(`fail to load ${file}`)
      }
      this.mergeConfigs(fn, flyConfig)

      // Process api
      fn.main = fn.main.bind(fn)
      fn.before = fn.before ? fn.before.bind(fn) : null
      fn.after = fn.after ? fn.after.bind(fn) : null
      fn.validate = fn.validate ? fn.validate.bind(fn) : null
      fn.file = file
      fn.dir = path.dirname(file)
      return fn
    } catch (err) {
      console.error('fail to load function', err)
      return false
    }
  }

  /**
   *
   * @param {String} file
   * @param {String} dir
   */
  buildFunctionName (file, dir) {
    let filePath = path.relative(dir, file)

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
  mergeConfigWithFly (config, flyConfig) {
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
  mergeConfigs (fn, flyConfig) {
    flyConfig = flyConfig || {}
    fn.config = this.mergeConfigWithFly(fn.config, flyConfig.config)
    fn.links = this.mergeConfigWithFly(fn.links, flyConfig.links)
    if (fn.events) {
      Object.keys(fn.events).forEach(event => {
        if (!flyConfig.events[event]) return

        this.mergeConfigWithFly(fn.events[event], flyConfig.events[event])
      })
    } else {
      fn.events = {}
    }
    return fn
  }

  /**
   * Get functions by event type
   *
   * @param {String} eventType
   * @returns {Array}
   */
  list (eventType) {
    let functions = {}
    Object.keys(this.functions).forEach(appName => {
      Object.keys(this.functions[appName]).forEach(fnName => {
        let fn = this.functions[appName][fnName]
        if (fn.events && fn.events[eventType]) {
          functions[fnName] = fn
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
      orignalCallName: name,
      callName: name,
      config: fn.config,
      targetEvent
    }), initalContext)

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
        let [main, type] = chian.shift()
        event = this.invoke(main, event, Object.assign(ctx, { type }))
      }
      return event
    } catch (err) {
      this.emit('error', err)
      throw err
    } finally {
      this.buildTraceInfo(ctx)
    }
  }

  /**
   * Build trace info
   *
   * @param {Object} ctx
   * @param {Number} level
   */
  buildTraceInfo (ctx, level) {
    ctx.traces.forEach((trace, i) => {
      level = level || 0

      debug([
        utils.padding(ctx.id || '', 36),
        '|', utils.padding(' '.repeat(level) + i + ' ' + trace.fn, 26),
        '|', utils.padding(trace.type || 'internal', '10'),
        '|', trace.error || '+' + trace.spendTime + 'ms'
      ].join(' '))

      if (trace.traces) {
        return this.buildTraceInfo(trace, level + 2)
      }
    })
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

    let trace = this.addTrace(ctx)
    let ret

    async function call (fn, event, ctx, retries) {
      retries = typeof retries === 'number' ? retries : 1
      try {
        return await fn(event, ctx)
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
      if (!trace.type) trace.type = 'internal'
      ret = await call(main, event, ctx, ctx.retries || null)
    } catch (err) {
      trace.error = err.message
      this.emit('error', Object.assign(err, { fn: main, event, ctx }))
      throw err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
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

    if (event) ctx.parentEvent = event
    if (!ctx.traces) ctx.traces = []
    if (!ctx.eventId) ctx.eventId = uuidv4()

    if (!ctx.call) {
      ctx.call = (name, evt) => {
        let fn = this.get(name)
        this.invoke(fn.main, evt || {}, Object.assign(ctx, {
          callerName: ctx.trace.fn,
          type: 'internal',
          callName: name,
          config: fn.config
        }))
      }
    }

    return ctx
  }

  /**
   * Add context
   *
   * @param {Object} ctx
   */
  addTrace (ctx) {
    let trace = {
      name: ctx.callName,
      type: ctx.type,
      startTime: Date.now(),
      traces: []
    }

    if (!ctx.callerName) {
      ctx.traces.push(trace)
      ctx.trace = trace
    } else {
      // Remove callerName flag to keep in current trace list
      ctx.trace.traces.push(trace)
    }
    delete ctx.callerName
    return trace
  }

  /**
   * Get runtime config for dir
   *
   * @param {String} dir
   */
  static getRuntime (dir) {
    const runtime = {}

    // Set FLY HOME
    runtime.env = process.env.NODE_ENV || 'development'
    runtime.cwd = process.cwd()

    if (dir) {
      runtime.dir = dir[0] === '/' ? dir : path.join(runtime.cwd, dir)
      debug(`dir use passed: ${dir}`)
    } else if (process.env.DIR) {
      runtime.dir = path.resolve(process.env.DIR)
      debug(`dir use env DIR: ${process.env.DIR}`)
    } else {
      runtime.dir = runtime.cwd
      debug(`dir use cwd: ${runtime.dir}`)
    }

    return runtime
  }
}

module.exports = Fly
