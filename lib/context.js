const uuidv4 = require('uuid/v4')

const Handler = {
  get (obj, prop) {
    return obj.get(prop)
  },

  set (obj, prop, value) {
    return obj.set(prop, value)
  }
}

class Context {
  constructor (data, event, fn, fly) {
    this.data = data || {}
    this.event = event
    this.fly = fly

    this.init()
  }

  static from (data, event, fn, fly) {
    return new Context(data, event, fn, fly)
  }

  init () {
    const data = this.data
    if (!data.eventId) {
      data.eventId = uuidv4().split('-').pop()
    }

    if (!data.hasOwnProperty('originalEvent')) data.originalEvent = this.event
    else data.parentEvent = this.event
  }

  get (key) {
    console.log('get', key)
    return this.data[key]
  }

  set (key, value) {
    console.log('set', key)
    this.data[key] = value
  }

  toContext () {
    return new Proxy(this, Handler)
  }
}

module.exports = Context
