const micromatch = require('micromatch')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const { FlyError } = require('./error')
const { FN_RESERVE_REGEX } = require('./utils')

class Loader {
  constructor (options) {
    this.options = options
    this.configs = {}
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
   * List all fly files
   */
  list () {
    const functions = []
    for (const prefix in this.options.mounts) {
      const dir = this.options.mounts[prefix]
      this.configs[dir] = Loader.GetConfig(dir, this.options.env)
      if (!prefix) {
        if (this.options.ignore) {
          this.options.ignore.forEach(item => {
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
   * Load fn
   * @param {String} file
   */
  load (file, options) {
    const { prefix = '', root = this.options.dir } = options || {}
    const config = this.configs[root]

    try {
      const { dir, ignore } = this.options
      const relativePath = path.relative(root, file)

      /**
       * Check dirs if project defines
       */
      if (micromatch.any(relativePath, ignore, { basename: true })) {
        // debug('ignore by rule:', relativePath)
        return false
      }

      const fileObj = require(file)
      const fn = typeof fileObj === 'function' ? { main: fileObj } : { ...require(file) }
      if (fn.toString().startsWith('class ')) {
        throw new FlyError('class is not support')
      }

      // if (typeof fn === 'function') {
      //   fn = { main: fn }
      // } else
      if (typeof fn.main !== 'function' && typeof fn.extends !== 'string') {
        // warn('no main entry:', file)
        throw new FlyError(`no main entry or extends: ${file}`)
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
      // if (force && fn.extends) {
      //   // debug('try extend:', fn.name)
      //   this.extend(fn.name, true)
      // }

      // debug('load fn ok:', fn.name)
      return fn
    } catch (err) {
      // console.error(err)
      // warn('load fn error:', err)
      // Fly.OutputWarning('load fn error', `ignore ${file}`, err.message)
      return false
    }
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
  static GetConfig (dir, env) {
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
