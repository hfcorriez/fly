const uuidv4 = require('uuid/v4')
const callerId = require('caller-id')
const { logger } = require('./utils')
const Fly = require('./fly')

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
      data.eventId = this.parentContext ? this.parentContext.eventId : uuidv4().split('-').pop()
    }

    if (!data.hasOwnProperty('originalEvent')) data.originalEvent = this.event
    else data.parentEvent = this.event

    if (!data.fly) {
      data.fly = {
        list: this.fly.list.bind(this.fly),
        get: this.fly.get.bind(this.fly),
        broadcast: this.fly.broadcast.bind(this.fly),
        end: data => ({ $end: data }),
        call: this.buildCaller(({ fn, args: [ name, evt, context, isolation ] }) => {
          isolation = isolation || context === true
          if (isolation) {
            context = context === true ? {} : context
          } else {
            context = this.expand(context)
          }
          const fnName = typeof name === 'object' ? name : (this.fly.exists(name) ? name : fn.prefix + name)
          return this.fly.call(fnName, evt, context)
            .then(result => [result, null])
            .catch(err => [null, err])
        }),
        super: this.buildCaller(({ fn, caller, event }) => {
          if (!caller.functionName || !fn[caller.functionName]) return event
          return this.invoke(fn[caller.functionName], fn, event, data, caller.functionName)
        }),
        debug: this.buildLogger('debug', data.eventId),
        info: this.buildLogger('info', data.eventId),
        warn: this.buildLogger('warn', data.eventId),
        error: this.buildLogger('error', data.eventId)
      }
    }
  }

  /**
   * Get key
   * @param {String} key
   */
  get (key) {
    if (key in this.data) {
      return this.data[key]
    }

    if (key in this.fly.config) {
      return this.fly.config[key]
    }

    if (this.fly.options.import[key]) {
      return this.fly.import(key)
    }

    const realFnName = `${this.fn.prefix || ''}${key}`
    if (this.fly.exists(realFnName)) {
      return (event, context) => {
        return this.fly.call(realFnName, event, this.expand(context))
      }
    }

    if (this[key] && typeof this[key] === 'function') {
      return this[key].bind(this)
    }

    if (this.parentContext) {
      return this.parentContext[key]
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
   * @param {Function} callee
   */
  buildCaller (callee) {
    const self = this

    function func (...args) {
      const caller = callerId.getData(func)
      const fn = self.fly.files[caller.filePath]
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
    return this.buildCaller(({ fn, args }) =>
      logger(this.fly.options.name, level, fn.name)(`(${eventId})`, ...args)
    )
  }
}

module.exports = Context
