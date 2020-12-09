const uuidv4 = require('uuid/v4')
const callerId = require('caller-id')
const { logger } = require('./utils')

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
  constructor (data, event, fn, fly) {
    this.data = data || {}
    this.event = event
    this.fly = fly
    this.fn = fn

    this.init()
  }

  static from (data, event, fn, fly) {
    if (data instanceof Context) {
      data = data.toData()
    }
    return new Context(data, event, fn, fly).toContext()
  }

  init () {
    const data = this.data
    if (!data.eventId) {
      data.eventId = uuidv4().split('-').pop()
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
            context = {
              originEventType: data.eventType,
              eventType: null,
              ...context
            }
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
        error: this.buildLogger('error', data.eventId),
        fatal: this.buildLogger('fatal', data.eventId)
      }
    }
  }

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
      return (evt, ctx) => {
        return this.fly.call(realFnName, evt, {
          originEventType: this.data.eventType,
          eventType: null,
          ...ctx
        })
      }
    }

    if (this[key] && typeof this[key] === 'function') {
      return this[key].bind(this)
    }

    return undefined
  }

  set (key, value) {
    this.data[key] = value
  }

  toData () {
    return this.data
  }

  toContext () {
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
      logger(this.fly.options.name, level, fn.name)(...args, `(${eventId})`)
    )
  }
}

module.exports = Context
