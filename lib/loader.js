const micromatch = require('micromatch')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const chokidar = require('chokidar')
const md5File = require('md5-file')

const Cache = require('./cache')
const { FN_RESERVE_REGEX, logger } = require('./utils')

const debug = logger('▶loader', 'debug')
const error = logger('▶loader', 'error')
const info = logger('▶loader', 'info')
const warn = logger('▶loader', 'warn')

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
    this.prepare(this.options.dir)
    return this.compileCache()
    // this.config = this.config()
  }

  /**
   * Compile cache
   */
  async compileCache () {
    if (this.options.useCache) return
    // this.list().forEach(item => this.checkCache(item))
    await Promise.all(this.list().map((item) => this.checkCache(item)))
    this.cache.save()
  }

  /**
   * Check cache if changed
   *
   * @param {Object} param
   */
  checkCache ({ name, file, prefix, fn, root }) {
    const md5sum = md5File.sync(file)
    // Compatible with fn check cache
    if (!name) name = `${prefix}${fn}`
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
          path: path.relative(root, file),
          prefix,
          events: fnObj.events || {},
          testFile: fnObj.testFile || null,
        }
        debug('update cache', name, md5sum)
        return this.cache.set(name, cache)
      } catch (err) {
        console.error(err)
        debug('delete cache', name)
        return this.cache.delete(name)
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

    debug('import:', file)
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
  get (name, extend) {
    if (!name) return null

    let fn = null
    if (name[0] === '/') {
      fn = this.files[name]
    } else if (this.functions[name]) {
      fn = this.functions[name]
    } else if (!this.functions[name] && this.cache.get(name)) {
      const { file, root, prefix } = this.cache.get(name)
      fn = this.load(file, { root, prefix })
    }

    if (!fn) return null

    // Extend when use
    if (extend) this.extend(fn)

    return fn
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
    debug('reload fn:', name)
    let fn = this.functions[name]
    if (!fn) return false

    fn = this.load(fn.file, { force: true, prefix: fn.prefix, root: fn.root })
    if (!fn) return false
    // info(`hotreload success: ${name}`)

    if (this.extends[fn.name]) this.extends[name].forEach(n => this.reload(n))
    return fn
  }

  /**
   * Delete
   *
   * @param {String} name
   */
  delete (name) {
    const fn = this.functions[name]
    if (!fn) return false
    debug('delete fn:', name)
    delete this.files[fn.file]
    delete this.functions[name]
    if (fn.extends && this.extends[fn.extends]) {
      this.extends[fn.extends].splice(this.extends[fn.extends].indexOf(name), 1)
    }
    delete require.cache[fn.file]
    this.cache.delete(name)
    return true
  }

  /**
   *
   * @param {String} dir
   */
  prepare (dir, prefix = '') {
    const envSettings = Loader.getEnvSettigns(dir)
    if (envSettings) {
      debug('process.env setup with', dir + '/.env')
      Object.assign(process.env, envSettings)
    }
    debug('perpare to load:', dir, prefix, envSettings)
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

    if (this.options.hotreload && !this.isWatching) {
      this.isWatching = true
      debug('hotreload setup for:', dir)

      // Watch files and ready to hot update
      chokidar.watch(dir, { ignoreInitial: true, ignored: /(^|[/\\])\../ }).on('all', (event, file) => {
        // ignore other files
        if (!['js', 'json'].includes(file.split('.').pop())) return

        // Get relative path
        const relativePath = path.relative(this.options.dir, file)
        debug('hotreload event:', event, relativePath)

        /**
        * Check dirs if project defines
        */
        let hasRequireLoaded = false
        try {
          hasRequireLoaded = !!require.cache[require.resolve(file)]
        } catch (e) {
        }

        if (micromatch.any(relativePath, this.options.ignore) && !hasRequireLoaded) {
          debug('ignore hotreload:', relativePath)
          return false
        }

        // When file exists and update
        if (event === 'add') event = 'change'

        // Get filename
        const filename = file.split('/').pop()

        // Process events
        switch (event) {
          case 'change':
            let fn
            if (this.imports[file]) {
              this.import(file, true)
            } else if (this.files[file]) {
              fn = this.files[file]
              const md5sum = md5File.sync(file)
              const cache = this.cache.get(fn.name)
              if (!cache || cache.md5sum !== md5sum) {
                fn = this.reload(this.files[file].name)
                if (fn) {
                  warn('hotreload:', fn.name, fn.path)
                }
              }
            } else if (filename.startsWith('fly.') && filename.endsWith('.yml')) {
              // this.loadConfig()
              // this.prepare(dir, prefix)
            } else if (file.endsWith('.js') && !file.endsWith('.test.js')) {
              fn = this.load(file, { suppressError: true, force: true })
              if (fn) {
                warn('hotreload new:', fn.name, fn.path)
              }
            }

            fn && this.checkCache(fn)
            break
          case 'unlink':
            const deleteFn = this.files[file]
            if (deleteFn) {
              info('hotreload del:', deleteFn.name, deleteFn.path)
              this.delete(deleteFn.name)
            }
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
    const loaded = {}

    // Find from memory first
    Object.keys(this.functions).forEach(name => {
      const fn = this.functions[name]
      if (type && !fn.events[type]) return
      if (options.type === 'project' && fn.prefix) return
      if (!loaded[fn.name]) {
        functions.push(fn)
        loaded[fn.name] = true
      }
    })

    // Find from cache
    Object.keys(this.cache.all()).forEach(name => {
      const fnCache = this.cache.get(name)
      if (type && !fnCache.events[type]) return
      if (options.type === 'project' && fnCache.prefix) return
      if (!loaded[fnCache.name]) {
        functions.push(fnCache)
        loaded[fnCache.name] = true
      }
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
        // ignore none js file
        if (!filePath.endsWith('.js') || filePath.endsWith('.test.js')) continue

        const testFilePath = filePath.replace(/\.js$/, '.test.js')
        let testFile = null
        if (fs.existsSync(testFilePath)) {
          testFile = testFilePath
          console.log('test file exists', testFile)
        }

        // compile function name
        const fn = file.split('/').pop().split('.').shift()

        functions.push({ file: filePath, prefix, fn, root, testFile })
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
  config (prefix = '') {
    return this.configs[prefix]
  }

  /**
   * Load fn
   * @param {String} file
   */
  load (file, options) {
    const { prefix = '', root = this.options.dir, force, suppressError = false } = options || {}
    const config = this.configs[prefix]

    try {
      const { dir, ignore } = this.options
      const relativePath = path.relative(root, file)

      /**
       * Check dirs if project defines
       */
      if (micromatch.any(relativePath, ignore, { basename: true })) {
        debug('ignore by rule:', relativePath)
        return false
      }

      if (force) {
        delete require.cache[file]
      }

      // @todo 如果从来加载过，需要更改cache

      const fileObj = require(file)
      const fn = typeof fileObj === 'function' ? { main: fileObj } : { ...require(file) }
      if (fn.toString().startsWith('class ')) {
        !suppressError && error('class not support:', file)
        return false
        // throw new FlyError('class is not support')
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function' && typeof fn.extends !== 'string') {
        // warn('no main entry:', file)
        !suppressError && error('not function:', file)
        return false
        // throw new FlyError(`no main entry or extends: ${file}`)
      }

      const name = (fn.name || path.basename(file, '.js'))

      // Process api
      fn.path = path.relative(dir, file)
      fn.name = prefix + name
      fn.prefix = prefix
      fn.file = file
      fn.dir = path.dirname(file)
      fn.root = root
      fn.events = fn.events || {}
      fn.chain = {}

      if (!fn.testFile) {
        const testFilepath = file.replace(/\.js$/, '.test.js')
        if (fs.existsSync(testFilepath)) {
          fn.testFile = testFilepath
        }
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
      this.files[file] = fn
      this.functions[fn.name] = fn

      debug('load ok:', fn.name)
      return fn
    } catch (err) {
      // console.error(err)
      error('load fn error:', err)
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
    const from = fn.extends

    if (!from || fn.extended) {
      return fn
    }

    debug('extend:', fn.name, 'from', fn.extends)
    const fromFn = this.get(from)
    if (!fromFn) {
      error(`extends fn not found: ${from}`)
      return fn
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
    fn.extended = true
    return fn
  }

  /**
   * Parse function events
   *
   * @param {Object} fn
   */
  parseEvents (fn) {
    fn.events = fn.events || {}
    // fn.methods = fn.methods || {}

    Object.keys(fn).forEach(key => {
      const matched = key.match(FN_RESERVE_REGEX)
      if (!matched) return

      const type = matched[1].toLowerCase()
      const event = matched[2].toLowerCase()

      if (type === 'config') {
        fn.events[event] = fn[key] || {}
      }
      // } else {
      //   fn.methods[event] = fn.methods[event] || {}
      //   fn.methods[event][type] = fn[key]
      // }
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

    if (!fs.existsSync(configFile)) return { project: {}, service: {} }

    try {
      config = Loader.getConfigWithEnv(configFile)
      if (configEnvFile && fs.existsSync(configEnvFile)) {
        info('load env config:', configEnvFile)
        let envConfig = Loader.getConfigWithEnv(configEnvFile)
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
      console.error('load yaml failed', err)
      // Fly.OutputWarning('config load failed:', err.message, dir)
    }

    return config
  }

  /**
   *  Get config with env variables
   *
   * @param {String} file
   * @returns
   */
  static getConfigWithEnv (file) {
    let content = String(fs.readFileSync(file, 'utf8'))
    if (/\.[A-Z]/.test(content)) {
      content = content.replace(/\.([A-Z_]+(?:\/(.*))?)/g, (_, name, defaultValue) => process.env[name] || defaultValue || '')
    }
    return yaml.load(content)
  }

  /**
   * Read env settings
   *
   * @param {String} dir
   * @returns
   */
  static getEnvSettigns (dir) {
    const envFile = path.join(dir, '.env')
    if (!fs.existsSync(envFile)) return false

    const content = fs.readFileSync(envFile, 'utf8')
    const envSettings = {}
    content.split('\n').forEach(line => {
      line = line.trim()
      if (line.startsWith('#') || !line) return

      const [key, value] = line.split('=')
      if (!/^[A-Z_]+$/.test(key)) return

      envSettings[key] = value
    })

    return envSettings
  }
}

module.exports = Loader
