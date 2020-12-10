const fs = require('fs')
const os = require('os')
const path = require('path')

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
  }

  /**
   * Get instance for cache
   *
   * @param {Object} options
   */
  static instance (options) {
    const key = options.dir
    Cache.instances = Cache.instances || {}
    if (!Cache.instances[key]) {
      Cache.instances[key] = new Cache(options)
    }
    return Cache.instances[key]
  }

  /**
   * Get cache path
   */
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
  delete (fn) {
    delete this.cacheMap[fn]
  }

  /**
   * Flush all cache
   */
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
  module.exports = ${require('util')
    .inspect(this.cacheMap, { showHidden: false, depth: null })
    .replace(/\[Function: (Number|Boolean|String)\]/g, (_, type) => type)};
`)
  }
}

module.exports = Cache
