const uuid = require('uuid/v4')
const fs = require('fs')
const path = require('path')
const os = require('os')
const debug = require('debug')('qi/cli/dis')
const Http = require('./http')
const Errors = require('./errors')
const Service = require('./service')
const Kv = require('./kv')
const Event = require('./event')

const QI_HOME = path.join(os.homedir(), '.qi')
const CACHE_VERSION = '1.0.3'

class Discover extends Http {
  constructor (options) {
    super(options)

    this.clients = []
    this.matchers = {}
    this.services = {}
    this.options = Object.assign({
      cacheFile: path.join(QI_HOME, 'cache'),
      register: true
    }, options)
    this.eventType = this.options.gateway ? this.options.gateway.type : null
    this.service = new Service({ redis: this.options.redis })
    this.kv = new Kv({ redis: this.options.redis })
    this.event = new Event({ redis: this.options.redis, sub: true })
    this.linkedServices = {}

    if (options.links && options.links.length) {
      this.QI = require(path.join(this.constructor.getServiceLibPath(), 'lib/qi'))
      if (!this.QI) {
        console.error('"qi-node" not found in global path, ignore links')
      } else {
        options.links.forEach(dir => {
          let qi = new this.QI({ dir }, this)
          this.linkedServices[qi.name] = qi
        })
      }
    }

    // ENSURE HOME IS EXISTS
    if (!fs.existsSync(QI_HOME)) fs.mkdirSync(QI_HOME)
    if (fs.existsSync(this.options.cacheFile)) {
      try {
        this.cache = JSON.parse(fs.readFileSync(this.options.cacheFile))
        if (!this.cache) throw new Error('empty cache')

        if (this.cache.version !== CACHE_VERSION) {
          console.error(`cache version ${this.cache.version} not equal ${CACHE_VERSION}, will reload`)
          throw new Error('cache version not match')
        }

        this.buildServices()
      } catch (err) {
      }
    }

    if (!this.cache) {
      this.cache = { version: CACHE_VERSION }
    }
  }

  /**
   * Dispatch to first function match the event
   *
   * @param {Object} event
   * @param {Object} ctx
   */
  async dispatch (event, ctx) {
    let info = this.findFunctionInfo(event, ctx)
    if (!info) {
      return false
    }

    return {
      result: await this.call(info, event, null, ctx),
      info
    }
  }

  /**
   * Broadcast to all functions match the event
   *
   * @param {Object} event
   * @param {Object} ctx
   */
  async broadcast (event, ctx) {
    debug(`broadcast event "${this.eventType}"`)
    let fns = this.findFunctionInfo(event, ctx, true)
    if (!fns || !fns.length) {
      return false
    }

    return Promise.all(fns.map(fn => this.call(
      fn, event, null,
      Object.assign(ctx || {}, { async: true })
    )))
  }

  /**
   * Check exists the function
   *
   * @param {String} fn
   */
  async exists (fn) {
    return !!(await this.findFunction(fn))
  }

  /**
   * Call function with name
   *
   * @param {String|Object} fn
   * @param {Object} event
   * @param {Array} nodes
   * @param {Object} ctx
   */
  call (fn, event, nodes, ctx) {
    if (typeof fn === 'string') fn = this.findFunction(fn)
    if (!fn) throw new Errors.FunctionNotFoundError()

    let service = this.services[fn.serviceName]
    if (!service) throw new Errors.ServiceUnknownError()

    if (!Array.isArray(nodes)) {
      ctx = nodes
      nodes = null
    }

    if (!nodes) {
      nodes = this.findNodes(fn.serviceName)
      if (!nodes || !nodes.length) {
        throw new Errors.NodeUnavailableError()
      }
    }
    let index = Math.floor(Math.random() * nodes.length)
    let node = nodes[index]
    if (!node) {
      debug(`${fn.serviceName}#${fn.name} has no available nodes`)
      throw new Errors.FunctionCallError()
    }

    debug(`call "${fn.serviceName}@${fn.name}"`)

    return this.client(node)
      .call(
        fn.name,
        Object.assign(event || {}, fn.eventData || {}),
        Object.assign({ id: uuid(), eventType: this.eventType }, ctx || {})
      )
  }

  /**
   * Find nodes with service name
   *
   * @param {String} name
   */
  findNodes (name) {
    debug(`find services for ${name}`)
    return this.services[name].nodes
  }

  /**
   * Match the function config with event
   *
   * @param {Object} event
   * @param {Boolean} all
   */
  findFunctionInfo (event, ctx, all) {
    ctx = ctx || {}

    let functionInfo = []
    let services = Object.keys(this.services)
      .filter(serviceName => this.match('service', this.services[serviceName]['config'], event))
      .map(serviceName => this.services[serviceName])

    services.forEach(service => {
      let serviceConfig = service.config
      if (!serviceConfig || !serviceConfig.functions) return

      Object.keys(serviceConfig.functions).forEach(funcName => {
        let fnConfig = serviceConfig.functions[funcName]
        if (!fnConfig.events || !fnConfig.events[this.eventType]) return

        let eventData = this.match('event', serviceConfig, event, fnConfig.events[this.eventType])
        if (!eventData) return

        functionInfo.push(
          Object.assign({
            serviceName: service.name,
            eventData,
            targetEvent: fnConfig.events[this.eventType],
            name: funcName
          }, fnConfig)
        )
      })
    })

    debug(`find ${functionInfo.length} functions`)
    return all ? functionInfo : functionInfo.shift()
  }

  /**
   * Find the funtion config
   *
   * @param {String} fn
   */
  findFunction (fn) {
    if (!fn.includes('@')) return false

    let [serviceName, fnName] = fn.split('@')
    let service = this.services[serviceName]

    if (!service) return false

    return Object.assign({
      serviceName: service.name,
      serviceVersion: service.version
    }, service.config.functions[fnName])
  }

  /**
   * Start client
   */
  async start () {
    await this.register()
    await this.startSync()
  }

  /**
   * Register the gateway
   */
  async register () {
    if (!this.options.register) return

    /**
     * Cron timer only need on to process
     */
    if (this.options.gateway && this.options.gateway.type === 'cron') {
      let exists = await this.service.exists({ name: 'gw-cron' })
      if (exists) {
        throw new Errors.DisallowMultipleInstanceError()
      }
    }

    let service = this.getServiceRegistry()
    debug('register service', service.name, service.address, service.port)
    await this.service.add(this.getServiceRegistry())
    await this.kv.set(this.getServiceConfig())
  }

  /**
   * Deregister the gateway
   */
  deregister () {
    if (!this.options.register) return
    let service = this.getServiceRegistry()
    debug('deregister service', service.name, service.address, service.port)
    return this.service.del(this.getServiceRegistry())
  }

  /**
   * Start sync timer
   */
  async startSync () {
    await this.sync()
    this.startSyncSub()
    this.syncTimer = setInterval(async () => {
      this.sync()
    }, 60000)
  }

  /**
   * Start sync timer
   */
  async startSyncSub () {
    this.event.on('sync_service', () => this.sync(1))
    this.event.on('sync_kv', () => this.sync(2))
  }

  /**
   * Stop sync timer
   */
  stopSync () {
    this.syncTimer && clearInterval(this.syncTimer)
  }

  /**
   * Process sync
   */
  async sync (pos) {
    debug('start sync', pos || 'all')

    if (pos === 1 || !pos) {
      this.cache.services = await this.service.list()
    }

    if (pos === 2 || !pos) {
      this.cache.kvs = await this.kv.list()
    }

    this.buildServices()

    // Sync to file cache
    fs.writeFileSync(
      this.options.cacheFile,
      Object.assign(JSON.stringify(this.cache), { updated: Date.now() })
    )
  }

  setMatchers (matchers) {
    Object.assign(this.matchers, matchers || {})
  }

  match (type, ...args) {
    return this.matchers[type].apply(null, args)
  }

  buildServices () {
    // build services nodes
    Object.keys(this.cache.services).forEach(serviceName => {
      this.services[serviceName] = {
        name: serviceName,
        nodes: this.cache.services[serviceName],
        kv: {}
      }
    })

    // build kv
    Object.keys(this.cache.kvs).forEach(serviceName => {
      if (!this.services[serviceName]) return
      Object.keys(this.cache.kvs[serviceName]).forEach(key => {
        if (key === 'config') {
          try {
            this.services[serviceName]['config'] = JSON.parse(this.cache.kvs[serviceName][key])
          } catch (err) {
            this.services[serviceName]['config'] = {}
          }
        } else {
          this.services[serviceName]['kv'][key] = this.cache.kvs[serviceName][key]
        }
      })
    })

    // Support linked services
    if (this.linkedServices) {
      Object.keys(this.linkedServices).forEach(serviceName => {
        let service = this.linkedServices[serviceName]
        if (!this.services[serviceName]) this.services[serviceName] = { name: serviceName }
        let functions = {}
        Object.keys(service.functions).forEach(fnName => {
          functions[fnName] = { events: service.functions[fnName]['events'] }
        })
        this.services[serviceName]['config'] = {
          gateways: service.gateways,
          functions,
          settings: service.settings
        }
        this.services[serviceName]['nodes'] = [this.linkedServices[serviceName]]
      })
    }
  }

  /**
   * Close client
   */
  async close () {
    await this.event.stop()
    await this.deregister()
    return true
  }

  /**
   * Client instance
   *
   * @param {Object} node
   */
  client (node) {
    if (this.QI && node instanceof this.QI) return node
    const key = `${node.meta.type}/${node.host}:${node.port}`

    if (!this.clients[key]) {
      if (node.meta.type === 'http') {
        this.clients[key] = new Http({ host: node.host, port: node.port })
      } else {
        throw new Errors.UnknownProtocolError()
      }
    }

    return this.clients[key]
  }

  /**
   *  Build register config
   */
  getServiceRegistry () {
    if (this.options.service) {
      return {
        name: this.qi.name,
        address: this.options.service.host,
        port: this.options.service.port,
        tags: this.options.service.tags || [],
        meta: {
          mode: this.options.service.mode,
          version: this.qi.version
        },
        checks: [{
          http: `http://${this.options.service.host}:${this.options.service.port}/health`,
          interval: '5s'
        }]
      }
    } else if (this.options.gateway) {
      return {
        name: `gw-${this.options.gateway.type}`,
        address: this.options.gateway.host,
        port: this.options.gateway.port,
        tags: this.options.gateway.tags || [],
        meta: {
          mode: this.options.gateway.type,
          version: this.options.gateway.version
        }
      }
    }

    return false
  }

  /**
   *  Build register config
   */
  getServiceConfig () {
    if (this.options.service) {
      let functions = {}
      Object.keys(this.qi.functions).map(name => {
        let fnConfig = this.qi.functions[name]
        functions[fnConfig.name] = {
          events: fnConfig.events
        }
      })

      return {
        name: this.qi.name,
        key: 'config',
        value: JSON.stringify({
          gateways: this.qi.gateways,
          functions,
          settings: this.qi.settings
        })
      }
    } else if (this.options.gateway) {
      return {
        name: `gw-${this.options.gateway.type}`,
        key: 'config',
        value: ''
      }
    }
  }

  static getServiceLibPath () {
    try {
      let commandPath = require('child_process').execSync('which qi-node').toString().trim()
      let qiPath = fs.realpathSync(commandPath)
      return path.join(qiPath, '../../')
    } catch (err) {
      return false
    }
  }
}

module.exports = Discover
