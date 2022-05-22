/* eslint-disable no-undef */

const FLY_STORE = {}
const FNS_BEFORE_HTTP = ['beforeCloudflare', 'beforeHttp', 'before']
const FNS_AFTER_HTTP = ['after', 'afterHttp', 'afterCloudflare']
const FNS_ALL_HTTP = [...FNS_BEFORE_HTTP, 'main', ...FNS_AFTER_HTTP]

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

function handleRequest (request) {
  return main(request)
}

const Handler = {
  get (obj, prop) {
    return obj.get(prop)
  },

  set (obj, prop, value) {
    obj.set(prop, value)
    return true
  }
}
class Context {
  constructor (data) {
    this.data = data || {}
  }
  get (key) {
    switch (key) {
      case 'cloudflare':
        return globalThis
      case 'fly':
        return {
          info: (...args) => console.log(...args),
          error: (...args) => console.error(...args),
          warn: (...args) => console.warn(...args)
        }
    }
    if (FLY_STORE[key]) {
      return FLY_STORE[key]
    }
    return this.data[key]
  }
  set (key, value) {
    this.data[key] = value
  }
  toProxy () {
    if (!this.proxy) {
      this.proxy = new Proxy(this, Handler)
    }
    return this.proxy
  }
}

// Setup
(function () {
  for (const key of Object.keys(FLY_STORE)) {
    const value = FLY_STORE[key]
    if (typeof value === 'function') {
      FLY_STORE[key] = { main: value }
    }
    if (typeof FLY_STORE[key] === 'object') {
      FLY_STORE[key].name = key
    }
  }
})()

async function main (request) {
  let event = convertEvent(request)
  const originalEvent = structuredClone(event)
  let { fn, cors } = matchEvent(event) || {}
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

  const ctx = new Context().toProxy()
  const chain = buildChain(fn)
  console.log('chain', chain)

  try {
    for (let key of Object.keys(chain)) {
      if (key === 'catch') continue

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
    const url = urlResolve(originalEvent.url, event.redirect)
    return Response.redirect(url, 301)
  }
  return new Response(body, { headers, status: event.status || 200 })
}

function buildChain (fn, eventType = 'http') {
  const chain = {}
  let decorator = null
  if (fn.decorator) {
    decorator = FLY_STORE[fn.decorator]
  }

  const build = (fn, key) => {
    if (!fn || !fn[key]) return
    value = fn[key]

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

function urlResolve (from, to) {
  const resolvedUrl = new URL(to, new URL(from, 'resolve://'))
  if (resolvedUrl.protocol === 'resolve:') {
    // `from` is a relative URL.
    const { pathname, search, hash } = resolvedUrl
    return pathname + search + hash
  }
  return resolvedUrl.toString()
}

function matchEvent (event) {
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

function convertEvent (request) {
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
