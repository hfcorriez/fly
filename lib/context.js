const fs = require('fs')
const path = require('path')
const { v4: uuid } = require('uuid')
const callerId = require('caller-id')
const colors = require('colors/safe')
const { logger } = require('./utils')
const Validator = require('./validator')

const debug = logger('▶context', 'debug')
// const info = logger('▶context', 'info')
const warn = logger('▶context', 'warn')

const Handler = {
  get (obj, prop) {
    return obj.get(prop)
  },

  set (obj, prop, value) {
    obj.set(prop, value)
    return true
  }
}

class Context {
  constructor (data, event, fn, fly, context) {
    this.parentContext = context
    this.event = event
    this.fly = fly
    this.fn = fn
    this.data = data || {}
    this.loader = this.fly.loader
    this.listeners = {}

    this.init()
  }

  /**
   * Build a context
   *
   * @param {Object} data
   * @param {Object} event
   * @param {Object} fn
   * @param {Fly} fly
   */
  static from (data, event, fn, fly, ctx) {
    if (data instanceof Context) {
      data.set('callee', fn)
      return data
    }
    return new Context(data, event, fn, fly, ctx).toProxy()
  }

  /**
   * Register function
   *
   * @param {String} name
   * @param {Function} fn
   */
  hook (name, fn) {
    if (!this.listeners[name]) this.listeners[name] = []
    this.listeners[name].push(fn)
  }

  /**
   * Emit name
   *
   * @param {String} name
   */
  emit (name, value) {
    const listeners = this.listeners[name] || []
    for (let listener of listeners) {
      listener(value)
    }
  }

  /**
   * Expands the context
   *
   * @param {*} context
   */
  expand (context) {
    if (context instanceof Context) return context
    if (!context) return this.toProxy()
    return new Context(context, this.event, this.fn, this.fly, this).toProxy()
  }

  /**
   * Init
   */
  init () {
    const data = this.data
    if (!data.eventId) {
      data.eventId = this.parentContext && this.parentContext.eventId ? this.parentContext.eventId : uuid().split('-').pop()
    }

    if (!data.hasOwnProperty('originalEvent')) data.originalEvent = this.event
    else data.parentEvent = this.event

    data.callee = this.fn
    data.fly = {
      ...this.loader.config(),
      env: this.fly.options.env,
      find: this.fly.find.bind(this.fly),
      get: this.fly.get.bind(this.fly),
      emit: (name, event, context) => this.fly.emit(name, event, context || this.proxy),
      call: this.buildCaller(({ fn, caller, args: [ name, event, context ] }) => {
        if (context) {
          context = context === true ? {} : context
        } else {
          context = this.proxy
        }
        // context.callerJs = caller
        const fnName = typeof name === 'object' ? name : (this.fly.exists(name) ? name : fn.prefix + name)
        return this.fly.call(fnName, event, context)
          .then(result => [result, null])
          .catch(err => [null, err])
      }),
      method: this.buildCaller(({ fn, args: [ name, method, event, context ] }) => {
        context = this.expand({
          originEventType: context && context.eventType,
          eventType: null,
          ...context
        })

        const fnName = typeof name === 'object' ? name : (this.fly.exists(name) ? name : fn.prefix + name)

        return this.fly.method(fnName, method, event, context)
          .then(result => [result, null])
          .catch(err => [null, err])
      }),
      super: this.buildCaller(({ fn, caller, args: [event] }) => {
        if (!caller.functionName || !fn[caller.functionName] || !fn.extends) return event
        const parentFn = this.loader.get(fn.extends)
        return this.fly.invoke(parentFn[caller.functionName], parentFn, event, this.toProxy(), caller.functionName)
      }),
      validate: (input, definition, message = true) => {
        const res = Validator.validateOne(input, definition)
        if (message && res.errors && res.errors.length) throw new Error(typeof message === 'string' ? message : 'validate failed')
        return res.value
      },
      debug: this.buildLogger('debug', data.eventId),
      log: this.buildLogger('info', data.eventId),
      info: this.buildLogger('info', data.eventId),
      warn: this.buildLogger('warn', data.eventId),
      error: this.buildLogger('error', data.eventId)
    }
  }

  /**
   * Get key
   * @param {String} key
   */
  get (key) {
    // Get context data
    if (key in this.data) {
      return this.data[key]
    }

    if (key === 'caller' && this.fn) {
      return this.fn
    }

    /**
     * Get fly function
     */
    const fnName = `${this.data.callee.prefix || ''}${key}`
    if (this.fly.exists(fnName)) {
      return (event, context) => this.fly.call(fnName, event, context || this.proxy)
    }

    /**
     * Call context self
     */
    if (this[key] && typeof this[key] === 'function') {
      return this[key].bind(this)
    }

    /**
     * Call parent context
     */
    if (this.parentContext) {
      const value = this.parentContext.get(key)
      if (value !== undefined) return value
    }

    // Load with key
    return this.load(key)
  }

  /**
   *  Load with dynamic
   *
   * @param {String} key
   * @returns
   */
  load (key) {
    // Ignore first
    if (Context.IGNORE_IMPORTS[key]) return undefined

    // If need require
    const isFile = ['@', '/'].includes(key[0])

    // Check project dir first
    try {
      if (isFile) {
        let filePath = !isFile ? key : key.substring(1)
        if (!filePath.includes('.') && !filePath.endsWith('.js')) filePath += '.js'
        filePath = path.join(this.fly.options.dir, filePath)

        if (filePath.endsWith('.js') || filePath.endsWith('.json')) {
          if (this.fly.options.env === 'development' && !Context.WATCH_FILES[filePath]) {
            debug('hotreload ready', filePath)
            Context.WATCH_FILES[filePath] = 1
            fs.watchFile(filePath, function () {
              warn('hotreload:', key, filePath)
              // delete when changed
              delete require.cache[filePath]
            })
          }
          return require(filePath)
        } else {
          return fs.readFileSync(filePath, 'utf8')
        }
      } else {
        return require(key)
      }
    } catch (err) {
      warn(`failed to load context.${key}`)
      // Ignore
      if (this.fly.options.env !== 'development' && !Context.IGNORE_IMPORTS[key]) {
        Context.IGNORE_IMPORTS[key] = 1
      }
      return undefined
    }
  }

  /**
   *  Set value
   *
   * @param {String} key
   * @param {Mixed} value
   */
  set (key, value) {
    this.data[key] = value
  }

  /**
   * To data
   */
  toData () {
    return { ...this.data, fly: undefined, callee: undefined, eventId: undefined, eventType: undefined, originalEvent: undefined, parentEvent: undefined }
  }

  /**
   * To proxy
   */
  toProxy () {
    if (!this.proxy) {
      this.proxy = new Proxy(this, Handler)
    }
    return this.proxy
  }

  /**
   * Build caller
   *
   * @param {Function} callee
   */
  buildCaller (callee) {
    const self = this

    function func (...args) {
      const caller = callerId.getData(func)
      const fn = self.loader.get(caller.filePath)
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
  buildLogger (level, eventId) {
    return this.buildCaller(({ fn, args }) => {
      if (level === 'error' && !this.fly.options.verbose) {
        args = args.map(arg => {
          if (arg instanceof Error) {
            return arg.stack.replace(/\n/, ' |').split('\n').shift()
          }
          return arg
        })
      }

      // Emit log event
      this.fly.emit('log', {
        name: fn.name,
        level,
        args,
        message: args.map(arg => {
          if (arg instanceof Error) {
            return arg.message + '\n' + arg.stack
          } else if (typeof arg === 'object') {
            return JSON.stringify(arg)
          }
          return arg
        }).join(' ')
      })
      return logger(fn.name, level)(...args, eventId ? colors.gray(`(${eventId.substring(6, 12)})`) : '')
    })
  }
}

Context.WATCH_FILES = {}
Context.IGNORE_IMPORTS = {}

module.exports = Context
