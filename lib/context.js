const fs = require('fs')
const path = require('path')
const { v4: uuid } = require('uuid')
const callerId = require('caller-id')
const colors = require('colors/safe')
const { logger } = require('./utils')
const Validator = require('./validator')
const { FlyValidateError } = require('./error')

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
  expand (context, event, fn) {
    return new Context(context, event, fn, this.fly, this).toProxy()
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
    data.log = data.Log = data.LOG = {
      log: this.buildLogger('info', data.eventId),
      debug: this.buildLogger('debug', data.eventId),
      info: this.buildLogger('info', data.eventId),
      warn: this.buildLogger('warn', data.eventId),
      error: this.buildLogger('error', data.eventId)
    }
    data.fly = data.Fly = data.FLY = {
      ...this.loader.config(),
      env: this.fly.options.env,
      find: this.fly.find.bind(this.fly),
      get: this.fly.get.bind(this.fly),
      emit: (name, event, context) => this.fly.emit(name, event, context || this.proxy),
      call: this.buildCaller(({ fn, caller, args: [ name, event, context ] }) => {
        const callFn = typeof name === 'object' ? name : (this.fly.get(name) || this.fly.get(fn.prefix + name))
        context = this.expand({
          originEventType: this.data.eventType,
          eventType: null,
          ...context
        }, event, callFn)

        // context.callerJs = caller
        return this.fly.call(callFn, event, context)
          .then(result => [result, null])
          .catch(err => [null, err])
      }),
      method: this.buildCaller(({ fn, args: [ name, method, event, context ] }) => {
        const callFn = typeof name === 'object' ? name : (this.fly.get(name) || this.fly.get(fn.prefix + name))
        context = this.expand({
          originEventType: this.data.eventType,
          eventType: null,
          ...context
        }, event, callFn)

        return this.fly.method(callFn, method, event, context)
          .then(result => [result, null])
          .catch(err => [null, err])
      }),
      super: this.buildCaller(({ fn, caller, args: [event] }) => {
        if (!caller.functionName || !fn[caller.functionName] || !fn.extends) return event
        const parentFn = this.loader.get(fn.extends)
        return this.fly.invoke(parentFn[caller.functionName], parentFn, event, this.toProxy(), caller.functionName)
      }),
      validate: (input, definition, error = true) => {
        const res = Validator.validateOne(input, definition)
        if (error && res.errors && res.errors.length) {
          throw new FlyValidateError([
            ...new Set(res.errors.map(e => `${e.message}${e.code ? ` [${e.code}]` : ''}`))].join(', ')
          , {
            ...res.errors[0],
            errors: res.errors
          })
        }
        return res.value
      },
      ...data.log
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

    // No event type specified
    if (key === 'eventType') return null

    // Get caller
    if (key === 'caller' && this.fn) {
      debug('context get caller', key)
      return this.fn
    }

    if (key === 'data') {
      debug('context get data', key)
      return this.toData()
    }

    // Get proxy
    if (key === 'context' || key === 'self' || key === 'ctx') {
      debug('context get self', key)
      return this.toProxy()
    }

    /**
     * Get fly function
     */
    const fnName = `${this.data.callee.prefix || ''}${key}`
    if (this.fly.exists(fnName)) {
      debug('context from fly function', key)
      return async (event, context) => {
        const [ result, error ] = await this.data.fly.call(fnName, event, context)
        if (error) throw error
        return result
      }
    }

    /**
     * Call context self
     */
    if (this[key] && typeof this[key] === 'function') {
      debug('context from method', key)
      return this[key].bind(this)
    }

    /**
     * Import context support
     */
    if (this.fly.options.import && this.fly.options.import[key]) {
      debug('context from import', key, this.fly.options.import[key])
      return this.load('@' + this.fly.options.import[key])
    }

    // Load with key
    let value = this.load(key)

    /**
     * Call parent context
     */
    if (value === undefined && this.parentContext) {
      value = this.parentContext.get(key)
      debug('context from parent', key, this.fly.options.import[key])
    }

    return value
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
    let loaded = null
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
          loaded = require(filePath)
        } else {
          loaded = fs.readFileSync(filePath, 'utf8')
        }
      } else {
        loaded = require(key)
      }
      debug('context loaded', key)
    } catch (err) {
      warn(`failed to load context[${key}]`)
      // Ignore
      if (this.fly.options.env !== 'development' && !Context.IGNORE_IMPORTS[key]) {
        Context.IGNORE_IMPORTS[key] = 1
      }
      loaded = undefined
    }
    return loaded
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
