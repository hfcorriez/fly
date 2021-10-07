const fs = require('fs')
const path = require('path')
const { v4: uuid } = require('uuid')
const callerId = require('caller-id')
const { logger } = require('./utils')
const colors = require('colors/safe')

const debug = logger('_context', 'debug')
const info = logger('_context', 'info')

const WATCH_FILES = []
const IGNORE_IMPORTS = []

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
    this.data = data || {}
    this.parentContext = context
    this.event = event
    this.fly = fly
    this.fn = fn
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
  static from (data, event, fn, fly) {
    if (data instanceof Context) return data
    return new Context(data, event, fn, fly).toProxy()
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

    data.fly = {
      ...this.loader.config(),
      callee: this.fn,
      find: this.fly.find.bind(this.fly),
      get: this.fly.get.bind(this.fly),
      emit: this.fly.emit.bind(this.fly),
      call: this.buildCaller(({ fn, caller, args: [ name, event, context, isolation ] }) => {
        isolation = isolation || context === true
        if (isolation) {
          context = context === true ? {} : context
        } else {
          context = this.expand({
            // originEventType: context && context.eventType,
            eventType: null,
            ...context
          })
        }
        context.caller = this.fn
        context.callerJs = caller
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
      debug: this.buildLogger('debug', data.eventId),
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

    /**
     * Get import module for project functions
     */
    if (!this.fn.prefix && typeof this.fly.options.import === 'object' && this.fly.options.import[key]) {
      return this.fly.import(key)
    }

    /**
     * Get fly function
     */
    const realFnName = `${this.fn.prefix || ''}${key}`
    if (this.fly.exists(realFnName)) {
      return (event, context) => {
        return this.fly.call(realFnName, event, this.expand({
          // originEventType: context && context.eventType,
          eventType: null,
          ...context
        }))
      }
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

    /**
     * Check require module
     */
    try {
      if (!IGNORE_IMPORTS.length || !IGNORE_IMPORTS.includes(key)) {
        if (key.startsWith('@')) {
          debug('lib import', key)
          return require(key.substr(1))
        } else if (key.startsWith('/')) {
          if (!key.endsWith('.js')) key += '.js'
          const filePath = path.join(this.fly.options.dir, key)
          if (this.fly.options.env === 'development' && !WATCH_FILES.includes(filePath)) {
            debug('hotload ready', filePath)
            WATCH_FILES.push(filePath)
            fs.watchFile(filePath, function () {
              info('hot reloaded:', filePath)
              // delete when changed
              delete require.cache[filePath]
            })
          }
          return require(filePath)
        }
      }
    } catch (err) {
      if (this.fly.options.env !== 'development') {
        IGNORE_IMPORTS.push(key)
      }
    }

    return undefined
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
    return this.data
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
      return logger(fn.name, level)(...args, eventId ? colors.gray(`(${eventId.substring(6, 12)})`) : '')
    })
  }
}

module.exports = Context
