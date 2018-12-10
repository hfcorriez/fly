const yaml = require('js-yaml')
const path = require('path')
const fs = require('fs')
const os = require('os')
const EventEmitter = require('events')
const uuidv4 = require('uuid/v4')
const utils = require('./utils')
const Errors = require('./errors')
const debug = require('debug')('fly/service/lib')
const FLY_HOME = path.join(os.homedir(), '.fly')

class FLY extends EventEmitter {
  constructor (options) {
    super()
    this.functions = {}
    this.runtime = {}
    this.services = []
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
    this.runtime = FLY.getRuntime(this.options.dir)

    // Inject the main service
    this.config = this.load(this.runtime.dir)
    Object.assign(this, this.config)

    // Add more functions
    this.add(path.join(__dirname, 'functions'))
  }

  /**
   * Add other functions
   *
   * @param {String} dir
   */
  add (dir) {
    let service = this.load(dir)
    this.services.push(service)
    return service
  }

  /**
   * Load dir
   *
   * @param {String} dir
   */
  load (dir) {
    let config

    try {
      config = yaml.safeLoad(fs.readFileSync(path.join(dir, 'function.yml'), 'utf8'))
      if (!config) return

      let envFile = path.join(dir, `function.${this.runtime.env}.yml`)
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
      this.emit('error', err)
      throw new Errors.DirLoadError()
    }

    const service = {
      name: config.name,
      version: config.version,
      provider: config.provider,
      gateways: config.gateways,
      settings: config.settings,
      functions: {}
    }

    debug(`load ${service.name} ${Object.keys(config.functions).length} functions: ${dir}"`)

    Object.keys(config.functions)
      .forEach(name => {
        let fnConfig = config.functions[name]
        let fnHandlerArr = fnConfig.handler ? fnConfig.handler.split(':') : null
        let fnNameArr = name.split('.')
        let fnName = fnNameArr[1]

        if (fnHandlerArr) {
          fnConfig.filename = fnHandlerArr[0] + '.js'
          // 如果没有冒号“:”，则认为是 main 函数
          fnName = fnHandlerArr[1] || 'main'
        }

        if (!fnConfig.filename) {
          /**
           * 如果不存在 filename（handler），则通过 name 来获取 filename
           */
          fnConfig.filename = fnNameArr[0] + '.js'
          fnConfig.type = 'js'
        } else {
          fnConfig.type = fnConfig.filename.split('.').pop()

          // Language special
          if (fnConfig.type !== 'js') return
        }

        fnConfig.file = `${path.join(dir, fnConfig.filename)}`
        if (!fs.existsSync(fnConfig.file)) {
          return
        }

        // name 为 `dir/file`
        fnConfig.name = fnConfig.name || name
        fnConfig.function = fnName
        fnConfig.dir = dir
        fnConfig.service = service

        if (service.functions[fnConfig.name]) {
          console.warn(`function "${fnConfig.name}" has been register, ignored`)
          return
        }

        service.functions[fnConfig.name] = FLY.buildFnConfig(fnConfig)
      })

    return service
  }

  /**
   *
   * Register function
   *
   * @param {String} name
   * @param {Function} config
   */
  set (name, config) {
    debug(`register "${name}"`)

    if (typeof config === 'function') {
      config = {
        name: name,
        events: {},
        callee: config
      }
    }

    this.functions[name] = FLY.buildFnConfig(config)
  }

  /**
   * Get functions by event type
   *
   * @param {String} eventType
   * @returns {Array}
   */
  list (eventType) {
    if (!eventType) return this.functions

    let functions = {}
    Object.keys(this.functions).forEach(name => {
      let fnConfig = this.functions[name]
      if (fnConfig.events && fnConfig.events[eventType]) {
        functions[name] = fnConfig
      }
    })
    return functions
  }

  /**
   * Get given function
   *
   * @param name
   */
  get (name) {
    let fnConfig = this.functions[name]

    if (!fnConfig) {
      let [tryService, tryFn] = name.split('@')

      // Try get function with name "fly@queue.add" and "queue.add" is all support
      if (!fnConfig && tryService === this.name) {
        fnConfig = this.functions[tryFn]
      }

      // Check fn from sub services
      if (!fnConfig && this.services.length) {
        this.services.forEach(service => {
          fnConfig = tryService === service.name ? service.functions[tryFn] : null
        })
      }
    }

    if (!fnConfig) return false

    if (!fnConfig.callee) {
      try {
        fnConfig.callee = require(fnConfig.file)[fnConfig.function]
      } catch (err) {
        this.emit('error', err)
        console.error(err)
        throw new Errors.CalleeNotFoundError(`"${name}" failed to get callee: ${err.message}`)
      }
    }

    return fnConfig
  }

  /**
   * Process function chains with event
   *
   * @param {String} fn
   * @param {Object} event
   */
  async call (fn, event, initalContext) {
    const ctx = this.getContext(initalContext)
    const stacks = []
    const targetEvent = this.getEvent(fn, ctx.eventType)

    // Init the target fn type
    // ctx.trace[fn] = { callType: `${ctx.callType || ''}@${ctx.eventType || ''}` }

    if (ctx.eventType === 'http') {
      stacks.push('fly-plugin@filter.http')
    }

    if (targetEvent) {
      stacks.push(...typeof targetEvent.stacks === 'string' ? [targetEvent.stacks] : Array.from((targetEvent.stacks || [])), fn)
    } else {
      stacks.push(fn)
    }

    let middlewares = stacks.map(fnName => async (event, ctx, next) => {
      let ret = await this.invoke(fnName, event, Object.assign(ctx, { type: 'middleware' }), next)
      // control flow without next
      if (ret === undefined) ret = await next()
      return ret
    })

    try {
      return await compose(middlewares)(event, ctx)
    } catch (err) {
      this.emit('error', err)
      throw err
    } finally {
      this.buildTraceInfo(ctx)
    }
  }

  buildTraceInfo (ctx, blank) {
    ctx.traces.forEach((trace, i) => {
      blank = blank || 0

      debug([
        utils.padding(ctx.id || '', 36),
        '|', utils.padding(' '.repeat(blank) + i + ' ' + trace.fn, 26),
        '|', utils.padding(trace.type || 'internal', '10'),
        '|', trace.error || '+' + trace.spendTime + 'ms'
      ].join(' '))

      if (trace.traces) {
        return this.buildTraceInfo(trace, blank + 2)
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
   * @param {String} fn    Function name
   * @param {Object} event
   * @param {Object} ctx
   * @param {Promise} next
   * @returns {*}
   */
  async invoke (fn, event, ctx, next) {
    event = event || {}
    next = next || noop()

    if (typeof ctx === 'function') {
      next = ctx
      ctx = null
    }

    let fnConfig = this.get(fn)
    ctx = this.getContext(ctx)
    ctx.this = fnConfig

    let remote = false
    if (!fnConfig) {
      if (!this.discover || !await this.discover.exists(fn)) {
        throw new Errors.FunctionNotFoundError(`function "${fn}" not found`)
      }
      remote = true
    }

    let trace = this.addTrace(fn, ctx)
    let ret

    async function call (fn, event, ctx, next, retries) {
      retries = typeof retries === 'number' ? retries : 1
      try {
        return await fn(event, ctx, next)
      } catch (err) {
        retries--
        if (retries <= 0) {
          throw err
        } else {
          debug('retry with error:', err.message)
          return call(fn, event, ctx, next, retries)
        }
      }
    }

    try {
      if (remote) {
        trace.type = 'remote'
        ret = await this.discover.call(fn, event, { id: ctx.id })
      } else {
        if (!trace.type) trace.type = 'internal'
        ret = await call(fnConfig.callee, event, ctx, next, ctx.retries || fnConfig.retries || null)
      }
    } catch (err) {
      trace.error = err.message
      this.emit('error', Object.assign(err, { fn, event, ctx }))
      throw err
    } finally {
      trace.spendTime = Date.now() - trace.startTime
    }

    return ret
  }

  /**
   * Get target event config for event
   *
   * @param {String} fn
   * @param {String} type
   */
  getEvent (fn, type) {
    if (!type) return false

    let fnConfig = this.get(fn)
    if (!fnConfig || !fnConfig.events) return false

    return fnConfig.events ? fnConfig.events[type] : false
  }

  /**
   * Create context for function
   *
   * @param {Object} initalContext
   */
  getContext (initalContext) {
    const ctx = initalContext || {}

    if (!ctx.traces) {
      ctx.traces = []
    }

    if (!ctx.call) {
      ctx.call = (fn, evt) => this
        .invoke(fn, evt || {}, Object.assign(ctx, { caller: ctx.currentTrace.fn, type: 'internal' }))
    }

    if (!ctx.id) {
      ctx.id = uuidv4()
    }

    if (!ctx.service) {
      ctx.service = {
        name: this.name,
        version: this.version,
        settings: this.settings
      }
    }

    return ctx
  }

  /**
   * Build fn config
   *
   * @param {Object} config
   */
  static buildFnConfig (config) {
    // Check events type to support Array and Object events
    Object.keys(config.events || {}).forEach(eventType => {
      if (typeof config.events[eventType] !== 'string') return

      config.events[eventType] = {
        default: config.events[eventType]
      }
    })

    return config
  }

  addTrace (fn, ctx) {
    let trace = {
      fn, type: ctx.type, startTime: Date.now(), traces: []
    }

    if (!ctx.caller) {
      ctx.traces.push(trace)
      ctx.currentTrace = trace
    } else {
      // Remove caller flag to keep in current trace list
      ctx.currentTrace.traces.push(trace)
    }
    delete ctx.caller
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

/**
 * Compose the middleware
 *
 * @param {[Function]} middlewares
 */
// function compose (middlewares) {
//   return async (next) => {
//     if (!next) next = noop()

//     let i = middlewares.length

//     while (i--) {
//       next = await middlewares[i].call(this, next)
//     }

//     return next
//   }
// }

async function noop () { }

function compose (middleware) {
  // 一些类型判断,middleware是数组,数组中的元素是函数
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */

  return function (event, ctx, next) {
    // last called middleware #
    let index = -1
    return dispatch(0)
    function dispatch (i) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i // 避免同一个中间件多次调用next
      let fn = middleware[i] // 获得中间件函数
      if (i === middleware.length) fn = next // 递归出口,调用结束
      if (!fn) return Promise.resolve()
      try {
        return Promise.resolve(fn(event, ctx, function next () {
          return dispatch(i + 1)
        }))
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}

module.exports = FLY
