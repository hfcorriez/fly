const micromatch = require('micromatch')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const chokidar = require('chokidar')
const md5File = require('md5-file')

const Cache = require('./cache')
const { FlyError } = require('./error')
const { FN_RESERVE_REGEX, logger } = require('./utils')

const info = logger('fly', 'loader', 'debug')
const error = logger('fly', 'loader', 'error')

class Loader {
  constructor (options) {
    this.options = options
    this.configs = {}
    this.files = {}
    this.imports = {}
    this.functions = {}
    this.extends = {}
    this.cache = Cache.instance(this.options)
  }

  /**
   * Get instance of loader
   *
   * @param {Object} options
   */
  static instance (options) {
    const key = options.dir
    Loader.instances = Loader.instances || {}
    if (!Loader.instances[key]) {
      Loader.instances[key] = new Loader(options)
    }
    return Loader.instances[key]
  }

  /**
   * Load cache
   */
  bootstrap () {
    this.compileCache()
    // this.config = this.config()
    this.prepare(this.options.dir, this.options.prefix)
  }

  /**
   * Compile cache
   */
  compileCache () {
    for (const item of this.list()) {
      this.checkCache(item)
    }
    this.cache.save()
  }

  /**
   * Check cache if changed
   *
   * @param {Object} param
   */
  checkCache ({ file, prefix, fn, root }) {
    const md5sum = md5File.sync(file)
    const name = `${prefix}${fn}`
    const cache = this.cache.get(name)
    if (!cache || cache.md5sum !== md5sum) {
      try {
        const fnObj = this.load(file, { prefix, root })
        if (!fnObj) return false

        const cache = {
          md5sum,
          file,
          name,
          root,
          prefix,
          events: fnObj.events || {}
        }
        this.cache.set(name, cache)
      } catch (err) {
        console.error(err)
        this.cache.delete(name)
      }
    }
  }

  /**
   * Import
   *
   * @param {String} file
   */
  import (file, force) {
    const filePath = this.options.import[file]
    if (filePath) {
      if (filePath.startsWith('.')) {
        file = path.join(this.options.dir, this.options.import[file])
      } else if (filePath.startsWith('/')) {
        file = filePath
      }
    } else {
      file = require.resolve(file)
    }
    if (this.imports[file] && !force) return this.imports[file]

    info('import:', file)
    delete require.cache[file]
    this.imports[file] = require(file)
    return this.imports[file]
  }

  /**
   * Get function from
   *
   * - function
   * - module@function
   *
   * @param {String} name
   */
  get (name) {
    if (!name) throw new FlyError('no name given')
    if (name[0] === '/') {
      return this.files[name]
    }
    if (this.functions[name]) {
      return this.functions[name]
    }
    if (!this.functions[name] && this.cache.get(name)) {
      const { file, root, prefix } = this.cache.get(name)
      return this.load(file, { root, prefix })
    }
    return false
  }

  /**
   * Exists function
   *
   * @param {String} name
   */
  exists (name) {
    return !!(this.functions[name] || this.cache.get(name))
  }

  /**
   * Reload
   *
   * @param {String} file
   */
  reload (name) {
    info('reload fn:', name)
    let fn = this.functions[name]
    if (!fn) return false

    fn = this.load(fn.file, { force: true, prefix: fn.prefix, root: fn.root })
    if (!fn) return false

    if (this.extends[fn.name]) this.extends[name].forEach(n => this.reload(n))
    return true
  }

  /**
   * Delete
   *
   * @param {String} name
   */
  delete (name) {
    const fn = this.functions[name]
    if (!fn) return false
    info('delete fn:', name)
    delete this.files[fn.file]
    delete this.functions[name]
    if (fn.extends && this.extends[fn.extends]) {
      this.extends[fn.extends].splice(this.extends[fn.extends].indexOf(name), 1)
    }
    delete require.cache[fn.file]
    return true
  }

  /**
   *
   * @param {String} dir
   */
  prepare (dir, prefix) {
    info('perpare:', dir, prefix)

    if (this.options.hotreload && !this.isWatching) {
      this.isWatching = true
      info('hotreload setup for:', dir)
      chokidar.watch(dir, { ignoreInitial: true, ignored: /(^|[/\\])\../ }).on('all', (event, file) => {
        info('hotreload event:', event, file)
        if (event === 'add' && this.files[file]) event = 'change'
        const filename = file.split('/').pop()
        switch (event) {
          case 'change':
            if (this.imports[file]) {
              this.import(file, true)
            } else if (this.files[file]) {
              this.reload(this.files[file].name)
            } else if (filename.startsWith('fly.') && filename.endsWith('.yml')) {
              // this.loadConfig()
              // this.prepare(dir, prefix)
            }
            break
          case 'unlink':
            if (this.files[file]) {
              this.delete(this.files[file].name)
            }
            break
          case 'add':
            this.load(file)
            break
        }
      })
    }
  }

  /**
   * Return functions with given type
   */
  find (type, options) {
    options = typeof type === 'object' ? type : options || {}
    const functions = []
    Object.keys(this.cache.all()).forEach(name => {
      const fnCache = this.cache.get(name)
      if (type && !fnCache.events[type]) return
      if (options.type === 'project' && fnCache.prefix) return
      !functions.includes(fnCache) && functions.push(fnCache)
    })
    return functions
  }

  /**
   * List all fly files
   */
  list () {
    const functions = []
    for (const prefix in this.options.mounts) {
      const dir = this.options.mounts[prefix]
      const config = this.configs[prefix] = Loader.getConfig(dir, this.options.env)
      if (config) {
        Object.assign(this.options, config.project || {})
        delete config.project
        config.project = this.options

        // Load ignore
        if (config.project && config.project.ignore) {
          config.project.ignore.forEach(item => {
            if (this.options.ignore.includes(item)) return
            this.options.ignore.push(item)
          })
        }
      }
      functions.push(...this.listDir(dir, { prefix, root: dir }))
    }
    return functions
  }

  /**
   * List dir
   *
   * @param {String} dir
   * @param {Object} options
   */
  listDir (dir, options) {
    const { dir: projectRoot, ignore } = this.options
    const { prefix, root = projectRoot } = options || {}

    const functions = []

    for (let file of fs.readdirSync(dir)) {
      if (file[0] === '.') continue
      let filePath = path.join(dir, file)
      let stat = fs.statSync(filePath)
      let isFile = stat.isFile()
      let relativePath = path.relative(root, filePath)

      if (isFile) {
        if (!filePath.endsWith('.js') || filePath.endsWith('.test.js')) continue
        const fn = file.split('/').pop().split('.').shift()
        functions.push({ file: filePath, prefix, fn, root })
      } else if (
        stat.isDirectory() &&
        // force ignore node_modules
        file !== 'node_modules' &&
        // Ignore hidden folders
        !file.startsWith('.')
      ) {
        const isAdd = !micromatch.any(relativePath + '/_', ignore)
        if (!isAdd) continue
        functions.push(...this.listDir(filePath, { prefix, root }))
      }
    }
    return functions
  }

  /**
   * Get config
   * @param {String} prefix
   */
  config (prefix) {
    return this.configs[prefix || '']
  }

  /**
   * Load fn
   * @param {String} file
   */
  load (file, options) {
    const { prefix = '', root = this.options.dir, force } = options || {}
    const config = this.configs[prefix]

    try {
      const { dir, ignore } = this.options
      const relativePath = path.relative(root, file)

      /**
       * Check dirs if project defines
       */
      if (micromatch.any(relativePath, ignore, { basename: true })) {
        info('ignore by rule:', relativePath)
        return false
      }

      if (force) {
        delete require.cache[file]
      }

      // @todo 如果从来加载过，需要更改cache

      const fileObj = require(file)
      const fn = typeof fileObj === 'function' ? { main: fileObj } : { ...require(file) }
      if (fn.toString().startsWith('class ')) {
        error('class not support:', fn.name)
        return false
        // throw new FlyError('class is not support')
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function' && typeof fn.extends !== 'string') {
        // warn('no main entry:', file)
        error('not function:', fn.name)
        return false
        // throw new FlyError(`no main entry or extends: ${file}`)
      }

      const name = (fn.name || path.basename(file, '.js'))

      // Process api
      fn.path = path.relative(dir, file)
      fn.name = prefix + name
      fn.prefix = prefix
      fn.retry = fn.retry === true ? 3 : typeof fn.retry === 'number' ? fn.retry : 0
      fn.file = file
      fn.dir = path.dirname(file)
      fn.root = root
      fn.events = fn.events || {}
      fn.chain = {}

      const testFilepath = file.replace(/\.js$/, '.test.js')
      if (fs.existsSync(testFilepath)) {
        fn.test = testFilepath
      }

      this.parseEvents(fn)

      // Service overwrite
      if (config) {
        Object.keys(fn.events).forEach(event => {
          if (event === 'service' && config[event]) {
            const serviceConfig = Object.values(config[event]).find(service => service.fn === fn.name)
            if (serviceConfig) {
              Object.assign(fn.events[event], serviceConfig)
            }
          } else if (config[event] && config[event][fn.name]) {
            Object.assign(fn.events[event], config[event][fn.name])
          }
        })
      }

      // Extends the function if function exists
      if (fn.extends) {
        this.extend(fn)
      }

      this.files[file] = fn
      this.functions[fn.name] = fn

      info('load ok:', fn.name)
      return fn
    } catch (err) {
      // console.error(err)
      // warn('load fn error:', err)
      // Fly.OutputWarning('load fn error', `ignore ${file}`, err.message)
      return false
    }
  }

  /**
   * Extend with name
   *
   * @param {String} name
   * @param {Boolean} force
   */
  extend (fn) {
    info('extend:', fn.name, 'from', fn.extends)
    const from = fn.extends

    const fromFn = this.get(from)
    if (!fromFn) {
      error(`extends fn not found: ${from}`)
      return
    }

    const extendKeys = []
    Object.keys(fromFn).forEach(key => {
      if (fn[key] || typeof fromFn[key] !== 'function') return
      extendKeys.push(key)
      fn[key] = fromFn[key]
    })
    // info(`extend ${fn.name} from ${from}`)

    this.parseEvents(fn)
    this.extends[from] = this.extends[from] || []
    this.extends[from].includes(fn.name) || this.extends[from].push(fn.name)
    return fn
  }

  /**
   * Parse function events
   *
   * @param {Object} fn
   */
  parseEvents (fn) {
    fn.events = fn.events || {}
    fn.methods = fn.methods || {}

    Object.keys(fn).forEach(key => {
      const matched = key.match(FN_RESERVE_REGEX)
      if (!matched) return

      const type = matched[1].toLowerCase()
      const event = matched[2].toLowerCase()

      if (type === 'config') {
        fn.events[event] = fn.events[event] || {}
        Object.assign(
          fn.events[event],
          typeof fn[key] === 'function' ? fn[key]() : fn[key]
        )
      } else {
        fn.methods[event] = fn.methods[event] || {}
        fn.methods[event][type] = fn[key]
      }
    })
  }

  /**
   * Load fly.yml from dir
   *
   * @param {String} dir
   */
  static getConfig (dir, env) {
    let config = null
    let configFile = path.join(dir, 'fly.yml')
    let configEnvFile = env ? path.join(dir, `fly.${env}.yml`) : null

    if (!fs.existsSync(configFile)) return config

    try {
      config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'))
      if (configEnvFile && fs.existsSync(configEnvFile)) {
        let envConfig = yaml.safeLoad(fs.readFileSync(configEnvFile, 'utf8'))
        if (envConfig) {
          Object.keys(envConfig).forEach(key => {
            if (typeof config[key] === 'object' || typeof envConfig[key] === 'object') {
              config[key] = Object.assign(config[key] || {}, envConfig[key] || {})
            } else {
              config[key] = envConfig[key]
            }
          })
        }
      }
    } catch (err) {
      // Fly.OutputWarning('config load failed:', err.message, dir)
    }

    return config
  }
}

module.exports = Loader
