const { pathToRegexp } = require('path-to-regexp')

module.exports = {
  /**
   * Find function
   *
   * @param {Object} event
   * @param {Object} config
   * @param {Object} ctx
   */
  main ({ event, config }, { fly }) {
    let matched
    let secondaryMatched
    let fallbackMatched

    fly.find('http').some(fn => {
      const matchedInfo = this.matchRoute(event, fn.events.http, config)

      // No match
      if (!matchedInfo.match) return false

      // Set fn
      matchedInfo.name = fn.name

      // Match not found and matched length less than current
      if (!matchedInfo.mode && (!matched || matched.length > matchedInfo.length)) {
        matched = matchedInfo
        if (matchedInfo.length === 0) return true
      } else if (matchedInfo.mode === 'fallback' && !fallbackMatched) {
        fallbackMatched = matchedInfo
      } else if (matchedInfo.mode) {
        secondaryMatched = matchedInfo
      }
      return false
    })

    return matched || secondaryMatched || fallbackMatched
  },

  /**
   * Match
   *
   * @param {Object} source
   * @param {Object} target
   */
  matchRoute (source, target, config) {
    if (!target.path && target.default) target.path = target.default
    if (!target.method) target.method = 'get'
    if (!target.path) return false

    // Normalrize method
    target.method = target.method.toLowerCase()
    if (target.path[0] !== '/') {
      console.warn('warn: http path is not start with "/", recommend to add it')
      target.path = '/' + target.path
    }

    let keys = []
    let regex = pathToRegexp(target.path, keys)
    let pathMatched = regex.exec(source.path)
    let mode = null
    let match = false
    let matchLength = 0
    let params = {}

    if (pathMatched) {
      matchLength = (pathMatched[1] || '').length
      keys.forEach((key, i) => (params[key.name] = pathMatched[i + 1]))

      // method match
      if (!match && (target.method.includes(source.method) || target.method === '*')) {
        match = true
      }

      // cors match
      if (!match && source.method === 'options' && (target.cors || config.cors)) {
        match = true
        mode = 'cors'
      }

      // head match
      if (!match && source.method === 'head' && (target.method.includes('get') || target.method === '*')) {
        match = true
        mode = 'head'
      }

      if (!match && target.fallback) {
        match = true
        mode = 'fallback'
      }
    }

    return { match, length: matchLength, mode, path: !!pathMatched, params, target, source }
  },
}
