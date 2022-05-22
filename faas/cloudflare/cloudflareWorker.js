/* eslint-disable no-undef */

const functions = {}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest (request) {
  const res = await main(request)
  return new Response(res[0], res[1])
}

class Context {
  get (key) {
    return functions[key]()
  }
}

async function main (request) {
  const event = convertEvent(request)
  const fn = matchEvent(event)
  if (!fn) return ['404 not found']

  const context = new Context()
  const res = await fn.main(event, context)
  let body = ''
  let headers = {}
  if (typeof res.body === 'object') {
    body = JSON.stringify(res.body)
    headers['content-type'] = 'text/json'
  }
  return [body, { headers }]
}

function matchEvent (event) {
  const { method, path } = event
  let matchedFn = null
  for (const key of Object.keys(functions)) {
    const fn = functions[key]()
    if (!fn.configHttp) continue
    const { path: targetPath, method: targetMethod = 'get' } = fn.configHttp
    if (targetMethod === method) {
      if (path === targetPath) {
        matchedFn = fn
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
