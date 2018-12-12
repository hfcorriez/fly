// Require the framework and instantiate it
const fastify = require('fastify')()
const debug = require('debug')('fly/app/htt')
const pathToRegexp = require('path-to-regexp')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const savedErrorPages = {}

exports.start = async (fly, { dir, port, errors }) => {
  if (errors) {
    Object.keys(errors).forEach(type => {
      let filePath = errors[type]
      if (!filePath.startsWith('/')) {
        filePath = path.join(__dirname, errors['404'])
      }
      savedErrorPages[type] = fs.readFileSync(filePath)
    })
  }

  fastify.route({
    method: ['GET', 'POST', 'HEAD', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
    url: '/*',
    handler: async function (req, res) {
      const urlObj = new URL('http://' + req.headers.host + req.raw.url)

      let event = {
        method: req.raw.method.toLowerCase(),
        path: urlObj.pathname,
        origin: urlObj.origin,
        host: urlObj.host,
        domain: urlObj.hostname,
        url: urlObj.href,
        protocol: urlObj.protocol,
        port: urlObj.port,
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.raw.socket.remoteAddress,
        headers: req.headers || {},
        body: req.body || {},
        query: req.query || {},
        search: urlObj.search,
        cookies: {}
      }

      if (event.headers.cookie) {
        event.headers.cookie.split(';').forEach(function (item) {
          const crumbs = item.split('=')
          if (crumbs.length > 1) event.cookies[crumbs[0].trim()] = crumbs[1].trim()
        })
      }

      let result
      let eventId = req.headers['x-qi-id']

      try {
        ({ result } = await client.dispatch(event, { id: eventId }))
      } catch (err) {
        res.code(502).type('application/json').send({
          code: err.code || 10,
          message: err.message
        })
        debug(`backend failed: ${err.message}`, err.stack)
        return
      }

      if (!result) {
        if (savedErrorPages['404']) {
          res.code(404).type('text/html').send(savedErrorPages['404'])
        } else {
          res.code(404).type('application/json').send({
            code: 12,
            message: `function not found`
          })
        }
        return
      }

      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.header(key, result.headers[key])
        })
      }

      if (result.redirect) {
        res.redirect(result.status || 302, result.redirect)
        return
      }

      // only headers no body
      if (result.headers && !result.body) {
        res.send('')
        return
      }

      if (result.status) {
        res.code(result.status)
      }

      if (result.type) {
        res.type(result.type)
      }

      /**
       * headers: {
       *    "x-powered-by": "qi"
       * }
       */

      // send body
      if (result.hasOwnProperty('body')) {
        if (!result.type && typeof result.body === 'string') res.type('text/html')
        res.send(result.body)
        return
      }

      // no body and other options response 500
      if (errors['500']) {
        res.code(500).type('text/html').send(errors['500'])
      } else {
        res.code(500).type('application/json').send({
          code: 111,
          message: 'no body return'
        })
      }
    }
  })

  /**
   * Rpc server
   */
  fastify.options('/rpc/*', async (request, reply) => {
    reply.send('')
  })

  fastify.post('/rpc/:fn', async (request, reply) => {
    try {
      let ctx = { callType: 'rpc' }

      if (request.headers['x-fly-id']) {
        ctx.id = request.headers['x-fly-id']
      }

      if (request.headers['x-fly-async']) {
        ctx.async = request.headers['x-fly-async'] === '1'
      }

      if (request.headers['x-fly-eventtype']) {
        ctx.eventType = request.headers['x-fly-eventtype']
      }

      // Check if async will async to do, such as background jobs
      if (ctx.async) {
        reply.send({ code: 0, data: null })
        fly.call(request.params.fn, request.body || {}, ctx)
      } else {
        let data = await fly.call(request.params.fn, request.body || {}, ctx)
        reply.send({ code: 0, data })
      }
    } catch (err) {
      debug('call function error:', err.message, err)
      reply.send({
        code: err.code || 1,
        message: err.message || 'call function error'
      })
    }
  })

  return new Promise((resolve, reject) => {
    fastify.listen(port, function (err) {
      if (err) return reject(err)
      resolve(port)
    })
  })
}
