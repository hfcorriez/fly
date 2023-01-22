const path = require('path')

const Validator = require('./validator')
const Loader = require('./loader')
const Context = require('./context')
const { FlyError } = require('./error')

const { FN_EXEC_BEFORE, FN_EXEC_AFTER, ucfirst, logger } = require('./utils')

const info = logger('▶fly', 'info')
const debug = logger('▶fly', 'debug')
const error = logger('▶fly', 'error')
const warn = logger('▶fly', 'warn')

const DEFAULT_PROJECT_CONFIG = {
  env: process.env.NODE_ENV || 'development',
  ext: ['js', 'fly.js'],
  defaultIgnore: [
    'node_modules/**',
    'lib/**',
    'bin/**',
    'test/**',
    'tests/**',
    'config/**',
    'public/**',
    '*.test.js'
  ],
  dir: process.cwd(),
  name: process.cwd().split('/').pop(),
  hotreload: false,
  import: {},
  mounts: { $: path.join(__dirname, '../functions') }
}

class Fly {
  constructor (options) {
    if (typeof options === 'string') {
      options = { dir: options }
    } else if (!options) {
      options = {}
    }

    this.options = { ...DEFAULT_PROJECT_CONFIG, ...options }
    this.options.dir = path.resolve(this.options.dir)
    if (!this.options.name) {
      this.options.name = this.options.dir.split('/').pop()
    }

    if (typeof options.hotreload !== 'boolean' && this.options.env === 'development') {
      this.options.hotreload = true
    }

    this.options.ignore = this.options.defaultIgnore.concat(this.options.ignore || [])
    this.options.mounts[''] = this.options.dir

    this.loader = Loader.instance(this.options)
    // this.cache = Cache.instance(this)
  }

  /**
   * Bootstrap FLY core
   */
  bootstrap () {
    // Inject the main service
    info('bootstrap:', JSON.stringify({ dir: this.options.dir, name: this.options.name, env: this.options.env }))
    return this.loader.bootstrap()
  }

  /**
   * Get function
   *
   * @param {String} name
   */
  get (name, extend) {
    return this.loader.get(name, extend)
  }

  /**
   *  Exists function?
   * @param {String} name
   */
  exists (name) {
    return this.loader.exists(name)
  }

  /**
   * Import
   * @param {String} name
   */
  import (name) {
    return this.loader.import(name)
  }

  /**
   * Get functions by event type
   *
   * @param {String} type
   *  - @param {String} type Enum[project, mount, all(default)]
   * @returns {Array}
   */
  find (type, options) {
    return this.loader.find(type, options)
  }

  /**
   * Process function chains with event
   *
   * @param {String} fn
   * @param {Object} event
   */
  async call (name, event, initalContext) {
    if (!name) throw new FlyError('no name to call')
    if (!event) event = {}

    if (typeof event !== 'object') {
      throw new FlyError('illegal event: ' + JSON.stringify(event))
    }

    name = name.name || name
    let fn = this.loader.get(name, true)
    if (!fn) throw new FlyError(`${name} not exists or something broken`)

    const eventType = initalContext && initalContext.eventType
    const chain = this.buildChain(fn, eventType)
    debug('build chain:', Object.keys(chain).join(' -> '))

    // const eventKeys = Object.keys(event)
    const ctx = Context.from(initalContext || {}, event, fn, this)

    try {
      for (let key of Object.keys(chain)) {
        if (key === 'catch') continue

        const [fnName, method] = chain[key]
        event = await this.invoke(fnName, method, event, ctx, eventType)
        ctx.emit(key, event)
        if (event && event.$end) {
          event = event.$end
          break
        }
      }
      info(`call success: ${fn.name}`)
    } catch (err) {
      if (!chain.catch) {
        error(`call failed: ${fn.name}`, '|', err.stack)
        this.emit('error', err)
        throw err
      } else {
        error(`call failed: ${fn.name}`, '|', err.stack.split('\n').slice(0, 2).map(i => i.trim()).join(' | '))
      }
      event = await this.invoke(chain.catch[0], chain.catch[1], err, ctx, eventType)
    }

    // if (ctx.originEventType) {
    //   ctx.eventType = ctx.originEventType
    //   ctx.originEventType = null
    // }

    // release ctx
    // ctx = undefined

    return event
  }

  async method (name, method, event, ctx) {
    if (!name) throw new FlyError('no name to call')
    if (!event) event = {}

    if (typeof event !== 'object') {
      throw new FlyError('illegal event: ' + JSON.stringify(event))
    }

    name = name.name || name
    let fn = this.loader.get(name, true)
    if (!fn) throw new FlyError(`function not available: ${name}`)
    if (!fn[method]) throw new FlyError(`method not available: ${name}:${method}`)

    return this.invoke(name, method, event, ctx)
  }

  /**
   * Call function without event match
   *
   * @param {String} fn    Function name
   * @param {Object} event
   * @param {Object} ctx
   * @returns {*}
   */
  invoke (name, method, event, ctx) {
    debug('invoke:', `${name}:${method}`)
    const fn = this.loader.get(name)

    if (method.startsWith('props')) {
      return Validator.validateEvent(event, fn[method], name)
    }

    ctx = Context.from(ctx, event, fn, this)

    const callee = fn[method]

    if (!callee) {
      throw new FlyError(`callee not available: ${name}:${method}`)
    }

    // const trace = {
    //   name: fn.name,
    //   startTime: Date.now(),
    //   invokeType: method,
    //   eventId: ctx.eventId
    // }

    // let ret
    // try {
    return callee.call(fn, event, ctx)
    // } catch (err) {
    // trace.error = err
    // } finally {
    // trace.spendTime = Date.now() - trace.startTime
    // const traceInfo = [
    //   `${trace.name}:${method}`,
    //   trace.error ? `| ${trace.error.stack.split('\n').shift()}` : ''
    // ].join(' ')
    // trace.error ? warn('invoke fail:', traceInfo) : debug('invoke success:', traceInfo)
    // }

    // if (trace.error) throw trace.error
    // return ret
  }

  /**
   * Parse function chain
   *
   * @param {Object} fn
   * @param {Object} ctx
   */
  buildChain (fn, eventType, prefix = '') {
    if (fn.chain && fn.chain[eventType]) return fn.chain[eventType]

    debug('start build chain:', fn.name, eventType || '')
    const chain = {}
    const self = this

    add('before')

    const eventTypeCap = eventType && ucfirst(eventType)
    const config = this.loader.config(fn.prefix)
    const decoratorConfigs = config && config.project.decorator ? config.project.decorator : {}
    const decorator = fn.decorator ? (decoratorConfigs[fn.decorator] || this.loader.get(fn.decorator)) : null

    const FNS_BEFORE = eventTypeCap ? FN_EXEC_BEFORE.map(f => f + eventTypeCap).concat(FN_EXEC_BEFORE) : FN_EXEC_BEFORE
    const FNS_AFTER = eventTypeCap ? FN_EXEC_AFTER.map(f => f + eventTypeCap).concat(FN_EXEC_AFTER) : FN_EXEC_AFTER
    const FNS_ALL = [...FNS_BEFORE, 'main', ...FNS_AFTER]

    FNS_BEFORE.forEach(key => build(decorator, key))
    FNS_ALL.forEach(key => build(fn, key))
    FNS_AFTER.forEach(key => build(decorator, key))

    add('after')

    // Save catch fn to chain
    const catchName = `catch${eventTypeCap}`

    if (fn[catchName]) {
      chain.catch = [fn.name, catchName, eventType]
    } else if (decorator && decorator[catchName]) {
      if (typeof decorator[catchName] === 'function') {
        chain.catch = [decorator.name, catchName, eventType]
      } else if (typeof decorator[catchName] === 'string') {
        const realDecorator = this.loader.get(decorator[catchName], true)
        chain.catch = [realDecorator.name, 'main', eventType]
      }
    } else if (fn.catch) {
      chain.catch = [fn.name, 'catch', eventType]
    }

    fn.chain[eventType] = chain

    return chain

    function add (type) {
      const filterFns = self.loader.find(type)
      if (filterFns && filterFns.length) {
        for (let filterFn of filterFns) {
          if (![true, '*', eventType].includes(filterFn.events[type])) continue
          filterFn = self.loader.get(filterFn.name)
          if (fn.name === filterFn.name) continue
          const beforeChain = self.buildChain(filterFn, eventType, filterFn.name + ':')
          Object.assign(chain, beforeChain)
        }
      }
    }

    function build (fn, key, value) {
      if (!fn || !fn[key]) return
      value = value || fn[key]

      if (typeof value === 'string' || Array.isArray(value)) {
        const chainFns = Array.isArray(value) ? value : [value]
        for (let chainFnName of chainFns) {
          const chainFn = self.loader.get(chainFnName, true)
          if (!chainFn) {
            throw new FlyError(`chain functon fail: ${chainFnName}`)
          }
          // parse before fn chain
          chain[prefix + chainFnName] = [chainFnName, 'main', eventType]
        }
      } else {
        chain[prefix + key] = [ fn.name, key, eventType ]
      }
    }
  }

  /**
   * Emit event
   *
   * @param {String} type
   * @param {Object | Null} event
   * @param {Object | Null} ctx
   */
  emit (type, event, ctx) {
    if (!type) {
      warn(`no event type to emit`)
      return
    }

    return Promise.all(
      this.loader.find(type).map(fn => {
        const config = fn.events[type]
        // Check config length if need check
        if (Object.keys(config).some(key => {
          // Detect types
          if (Array.isArray(config[key])) {
            // Match array element
            return !config[key].includes(event[key])
          } else {
            // Match value
            return config[key] !== event[key]
          }
        })) {
          warn(`emit ${type} failed with fn config`)
          return false
        }
        return this.call(fn.name, event, ctx)
      })
    )
  }
}

module.exports = Fly
