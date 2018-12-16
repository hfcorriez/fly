const redis = require('./lib/redis')

class Event {
  constructor(options) {
    this.options = options
    this.redis = redis(options.redis)
    this.callbacks = {}

    if (options.sub) {
      this.subKey = this.constructor.key('*')
      this.subRedis = redis(Object.assign(options.redis, { sub: 1 }))
      this.subRedis.psubscribe(this.subKey)
      this.subRedis.on('pmessage', (pattern, channel, message) => {
        let name = channel.substr(7)
        if (this.callbacks[name] && this.callbacks[name].length) {
          this.callbacks[name].forEach(cb => {
            cb.apply(null, message ? JSON.parse(message) : {})
          })
        }
      })
    }
  }

  emit (name, data) {
    let key = this.constructor.key(name)
    return this.redis.publish(key, JSON.stringify(data))
  }

  on (name, cb) {
    if (!this.options.sub) throw new Error('option "sub" is disabled')
    if (!this.callbacks[name]) this.callbacks[name] = []
    this.callbacks[name].push(cb)
  }

  off (name) {
    if (!this.subKey) return
    delete this.callbacks[name]
  }

  async stop (name) {
    if (!this.subKey) return
    await this.subRedis.punsubscribe(this.subKey)
  }

  async start () {
    if (!this.subKey) return
    await this.subRedis.psubscribe(this.subKey)
  }

  static key () {
    return 'QI/EVT/' + Array.prototype.slice.call(arguments).map(val => val.toLowerCase()).join('/')
  }
}

module.exports = Event
