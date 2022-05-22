/* eslint-disable no-undef */

const FLY_STORE = {}
const FNS_BEFORE_HTTP = ['beforeCloudflare', 'beforeHttp', 'propsHttp', 'before', 'props']
const FNS_AFTER_HTTP = ['after', 'afterHttp', 'afterCloudflare']
const FNS_ALL_HTTP = [...FNS_BEFORE_HTTP, 'main', ...FNS_AFTER_HTTP]

const cloudflare = this

addEventListener('fetch', event => {
  event.respondWith(new CFRuntime().run(event.request))
})

class CFContext {
  constructor (data) {
    this.data = data || {}
  }
  get (key) {
    switch (key) {
      case 'cloudflare':
        return cloudflare
      case 'fly':
        return {
          validate: (input, definition, message = true) => {
            const res = cloudflare.validator.validateOne(input, definition)
            if (message && res.errors && res.errors.length) throw new Error(typeof message === 'string' ? message : 'validate failed')
            return res.value
          },
          info: (...args) => console.log(...args),
          error: (...args) => console.error(...args),
          warn: (...args) => console.warn(...args)
        }
    }
    if (FLY_STORE[key]) {
      if (FLY_STORE[key].main) {
        return (event) => {
          return FLY_STORE[key].main(event, this.proxy)
        }
      }
      return FLY_STORE[key]
    }

    /**
     * Call context self
     */
    if (this[key] && typeof this[key] === 'function') {
      return this[key].bind(this)
    }

    return this.data[key]
  }
  set (key, value) {
    this.data[key] = value
  }
  toProxy () {
    if (!this.proxy) {
      this.proxy = new Proxy(this, {
        get: (obj, prop) => obj.get(prop),
        set: (obj, prop, value) => obj.set(prop, value)
      })
    }
    return this.proxy
  }
}

// Setup
class CFRuntime {
  constructor () {
    for (const key of Object.keys(FLY_STORE)) {
      const value = FLY_STORE[key]
      if (typeof value === 'function') {
        FLY_STORE[key] = { main: value }
      }
      if (typeof FLY_STORE[key] === 'object') {
        FLY_STORE[key].name = key
      }
    }
  }

  async run (request) {
    let event = this.convert(request)
    const originalEvent = event.originalEvent = structuredClone(event)
    let { fn, cors } = this.match(event) || {}
    if (!fn && !cors) return new Response('404 not found', { status: '404' })

    if (cors) {
      return new Response('', {
        headers: {
          'access-control-allow-origin': event.headers['origin'] || '*',
          'access-control-allow-methods': event.headers['access-control-request-method'] || 'GET,HEAD,PUT,PATCH,POST,DELETE',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': event.headers['access-control-request-headers'] || '*'
        },
        status: 204
      })
    }

    const ctx = new CFContext().toProxy()
    const chain = this.buildChain(fn)

    try {
      for (let key of Object.keys(chain)) {
        if (key === 'catch') continue

        if (key.startsWith('props')) {
          cloudflare.validator.validateEvent(event, chain[key])
        }

        const [name, method] = chain[key]
        const chainFn = FLY_STORE[name]
        event = await chainFn[method](event, ctx)
        if (event && event.$end) {
          event = event.$end
          break
        }
      }
    } catch (err) {
      if (!chain.catch) throw err
      const catchFn = FLY_STORE[chain.catch[0]]
      event = await catchFn[chain.catch[1]](err, ctx)
    }

    let body = event.body
    let headers = {}
    if (typeof body === 'object') {
      body = JSON.stringify(event.body)
      headers['content-type'] = 'text/json'
    } else if (event.file) {
      const file = FLY_STORE['/' + event.file]
      if (!file) {
        return new Response('404 not found', { status: 404 })
      }
      const [type, data] = file.split(':')
      headers['content-type'] = type
      body = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    } else if (event.redirect) {
      const url = this.urlResolve(originalEvent.url, event.redirect)
      return Response.redirect(url, 301)
    }
    return new Response(body, { headers, status: event.status || 200 })
  }

  buildChain (fn, eventType = 'http') {
    const chain = {}
    let decorator = null
    if (fn.decorator) {
      decorator = FLY_STORE[fn.decorator]
    }

    const build = (fn, key) => {
      if (!fn || !fn[key]) return
      const value = fn[key]

      if (typeof value === 'string' || Array.isArray(value)) {
        const chainFns = Array.isArray(value) ? value : [value]
        for (let chainName of chainFns) {
          const chainFn = FLY_STORE[chainName]
          // parse before fn chain
          if (chainFn) {
            chain[`chain:${chainName}`] = [chainName, 'main', eventType]
          }
        }
      } else {
        chain[key] = [ fn.name, key, eventType ]
      }
    }

    FNS_BEFORE_HTTP.forEach(key => build(decorator, key, chain))
    FNS_ALL_HTTP.forEach(key => build(fn, key, chain))
    FNS_AFTER_HTTP.forEach(key => build(decorator, key, chain))

    // Save catch fn to chain
    const catchName = 'catchHttp'

    if (fn[catchName]) {
      chain.catch = [fn.name, catchName, eventType]
    } else if (decorator && decorator[catchName]) {
      chain.catch = [decorator.name, catchName, eventType]
    } else if (fn.catch) {
      chain.catch = [fn.name, 'catch', eventType]
    }

    return chain
  }

  urlResolve (from, to) {
    const resolvedUrl = new URL(to, new URL(from, 'resolve://'))
    if (resolvedUrl.protocol === 'resolve:') {
    // `from` is a relative URL.
      const { pathname, search, hash } = resolvedUrl
      return pathname + search + hash
    }
    return resolvedUrl.toString()
  }

  match (event) {
    const { method, path } = event
    let matchedFn = null
    for (const key of Object.keys(FLY_STORE)) {
      const fn = FLY_STORE[key]
      if (!fn.configHttp) continue
      const { path: targetPath, method: targetMethod = 'get' } = fn.configHttp
      if (method === 'options' || targetMethod === method || targetMethod === '*') {
        if (path === targetPath) {
          if (method === 'options') {
            matchedFn = { cors: true }
          } else {
            matchedFn = { name: key, fn }
          }
          break
        } else if (targetPath.includes(':')) {
          const pathRegexp = new RegExp(['^',
            targetPath
              .replace(/\./g, '\\.')
              .replace(/:([^/]+)/g, '(?<$1>[^/]+)'),
            '$'].join(''))
          const pathMatched = pathRegexp.exec(path)
          if (pathMatched) {
            matchedFn = { name: key, fn }
            event.params = pathMatched.groups
            break
          }
        }
      }
    }
    return matchedFn
  }

  convert (request) {
    const headers = {}
    for (const pair of request.headers.entries()) {
      headers[pair[0].toLowerCase()] = pair[1]
    }

    const urlObj = new URL(request.url)
    const query = {}
    for (const pair of urlObj.searchParams.entries()) {
      query[pair[0].toLowerCase()] = pair[1]
    }

    return {
      method: request.method.toLowerCase(),
      path: urlObj.pathname,
      origin: urlObj.origin,
      host: urlObj.host,
      domain: urlObj.hostname,
      url: urlObj.href,
      protocol: urlObj.protocol,
      port: urlObj.port,
      ip: headers['cf-connecting-ip'],
      cloudflare: request.cf,
      headers,
      body: request.body || {},
      query,
      search: urlObj.search,
      cookies: {}
    }
  }
}
