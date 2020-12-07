const fs = require('fs')
const os = require('os')
const path = require('path')
const md5File = require('md5-file')

const Loader = require('./loader')

class Cache {
  constructor (options) {
    this.options = options
    const dirMd5 = require('crypto').createHash('md5').update(this.options.dir).digest('hex')
    const projectCachePath = path.join(os.tmpdir(), 'fly', dirMd5)
    if (!fs.existsSync(projectCachePath)) {
      fs.mkdirSync(projectCachePath, { recursive: true })
    }
    this.projectCacheFilePath = `${projectCachePath}/cache.js`
    try {
      this.cacheMap = require(this.projectCacheFilePath)
    } catch (err) {
      this.cacheMap = {}
    }

    this.loader = Loader.instance(this.options)
  }

  static instance (options) {
    const key = options.dir
    Cache.instances = Cache.instances || {}
    if (!Cache.instances[key]) {
      Cache.instances[key] = new Cache(options)
    }
    return Cache.instances[key]
  }

  compile () {
    for (const item of this.loader.list()) {
      this.check(item)
    }
  }

  check ({ file, prefix, fn, root }) {
    const md5sum = md5File.sync(file)
    const name = `${prefix}${fn}`
    if (!this.cacheMap[name] || this.cacheMap[name].md5sum !== md5sum) {
      try {
        const fnObj = this.loader.load(file, { prefix, root })
        const cache = {
          md5sum,
          file,
          name,
          root,
          events: fnObj.events || {}
        }
        this.set(name, cache)
      } catch (err) {
        console.error(err)
        delete this.cacheMap[name]
      }
    }
  }

  path () {
    return this.projectCacheFilePath
  }

  /**
   * Set function
   */
  set (fn, config) {
    this.cacheMap[fn] = config
  }

  /**
   * Delete function
   *
   * @param {String} fn
   */
  del (fn) {
    delete this.cacheMap[fn]
  }

  flush () {
    this.cacheMap = {}
  }

  /**
   * Get map
   */
  get (fn) {
    return this.cacheMap[fn]
  }

  /**
   * Get all cache
   */
  all () {
    return this.cacheMap
  }

  /**
   * Write cache
   */
  save () {
    fs.writeFileSync(this.projectCacheFilePath, `
module.exports = ${JSON.stringify(this.cacheMap)};
`)
  }
}

module.exports = Cache
