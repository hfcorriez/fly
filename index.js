const FLY = require('./lib/fly')
const Discover = require('fly-client').Discover
const debug = require('debug')('fly/app/ind')

class Service {
  constructor (options) {
    if (typeof dir === 'string') {
      options = { dir: options }
    }

    this.options = Object.assign({
      register: true,
      mode: 'http',
      port: 10241
    }, options)

    this.discover = new Discover({
      register: this.options.register,
      redis: {
        host: this.options.redis_host,
        port: this.options.redis_port
      },
      service: {
        host: '127.0.0.1', // TODO: fetch internal host
        port: this.options.port,
        mode: this.options.mode
      }
    })

    this.fly = new FLY({ dir: this.options.dir }, this.discover)
  }

  async start () {
    this.fly.on('error', err => this.dispatch('error', err))
    await this.dispatch('start')
    return require(`./${this.options.mode}`).start(this.fly, { dir: this.dir, port: this.options.port })
      .then(async () => {
        await this.discover.start()
        return this.fly
      })
  }

  async close () {
    debug('close service')
    await this.dispatch('stop')
    try {
      return await this.discover.close()
    } catch (err) {
    }
    return false
  }

  dispatch (type, data) {
    let fns = this.fly.list('system')
    return Promise.all(Object.keys(fns).map(name => fns[name]).filter(fn => fn.events.system.default === type).map(fn => {
      return this.fly.call(fn.name, data).catch(err => console.error(err))
    }))
  }
}

module.exports = Service
module.exports.FLY = FLY
