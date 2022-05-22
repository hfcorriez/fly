/* eslint-disable no-undef */

const functions = {}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest (request) {
  const res = await main(request)
  return new Response(res[0], res[1])
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
    if (functions[key]) {
      return functions[key]
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

async function main (request) {
  const event = convertEvent(request)
  let fn = matchEvent(event)
  if (!fn) return ['404 not found', { status: '404' }]

  if (fn === 204) {
    return ['', {
      headers: {
        'access-control-allow-origin': event.headers['origin'] || '*',
        'access-control-allow-methods': event.headers['access-control-request-method'] || 'GET,HEAD,PUT,PATCH,POST,DELETE',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': event.headers['access-control-request-headers'] || '*'
      },
      status: 204
    }]
  }

  if (typeof fn === 'function') {
    fn = { main: fn }
  }

  const context = new Context().toProxy()
  const res = await fn.main(event, context)
  let body = res.body
  let headers = {}
  if (typeof body === 'object') {
    body = JSON.stringify(res.body)
    headers['content-type'] = 'text/json'
  }
  return [body, { headers, status: res.status || 200 }]
}

function matchEvent (event) {
  const { method, path } = event
  let matchedFn = null
  for (const key of Object.keys(functions)) {
    const fn = functions[key]
    if (!fn.configHttp) continue
    const { path: targetPath, method: targetMethod = 'get' } = fn.configHttp
    if (method === 'options' || targetMethod === method || targetMethod === '*') {
      if (path === targetPath) {
        if (method === 'options') {
          matchedFn = 204
        } else {
          matchedFn = fn
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
          matchedFn = fn
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
