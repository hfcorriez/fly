const Event = require('./event')
const redis = require('./lib/redis')

class Kv {
  constructor(options) {
    this.options = options
    this.redis = redis(options.redis)
    this.event = new Event({ redis: options.redis, sub: false })
  }

  async set (config) {
    if (!config.name) throw new Error('"id" need')

    let key = this.constructor.key(config.name, config.key)
    await this.redis.set(key, config.value)

    return this.event.emit('sync_kv')
  }

  async del (config) {
    await this.redis.del(this.constructor.key(config.name, config.key))
    return this.event.emit('sync_kv')
  }

  async get (config) {
    let ret = await this.redis.get(this.constructor.key(config.name, config.key))
    return ret
  }

  async list (config) {
    config = config || {}
    let keys = await this.redis.keys(this.constructor.key(config.name || '*', config.key || '*'))
    let values = await Promise.all(keys.map(key => this.redis.get(key)))

    let configs = {}

    for (let i in values) {
      let [service, key] = keys[i].substr(7).split('/')

      if (!configs[service]) configs[service] = {}
      configs[service][key] = values[i]
    }

    return configs
  }

  static key () {
    return 'QI/CFG/' + Array.prototype.slice.call(arguments).map(val => val.toLowerCase()).join('/')
  }
}

module.exports = Kv
