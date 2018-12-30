const fs = require('fs')
const mime = require('mime')
const path = require('path')
const { URL } = require('url')
const fastify = require('fastify')()

module.exports = {
  config: {
    port: 8000
  },

  main: async function (event, ctx) {
    const root = path.resolve(event.params.dir || '.')
    fastify.route({
      method: ['GET'],
      url: '/*',
      handler: async (req, res) => {
        const urlObj = new URL('http://' + req.headers.host + req.raw.url)
        const filePath = path.join(root, urlObj.pathname.substr(1))
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath)
          if (stat.isDirectory()) {
            const files = fs.readdirSync(filePath)
            res.type('html').send([
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${urlObj.pathname}</title>
</head>
<body><ul>`,
              (urlObj.pathname === '/' ? [] : ['..']).concat(files).map(f => {
                return `<li><a href="${path.join(urlObj.pathname, f)}">${f}</a></li>`
              }).join(''),
              `</ul></body></html>`
            ].join(''))
          } else {
            res.type(mime.getType(filePath)).send(fs.createReadStream(filePath))
          }
        } else {
          res.status(404).send('404 Not found')
        }
      }
    })

    return new Promise((resolve, reject) => {
      const port = event.port || this.config.port
      fastify.listen(port, (err, address) => {
        if (err) return reject(err)
        console.log('Serve at: ' + address)
        resolve({ address })
      })
    })
  },

  after: function (event) {
    !event && process.exit(0)
  },

  events: {
    command: {
      _: 'serve [dir]',
      args: {
        '--port': Number,
      },
      alias: {
        '--port': '-p',
      },
      descriptions: {
        _: 'Serve dir as http service',
        '[dir]': 'optional dir',
        '--port': 'Bind port',
      }
    }
  }
}
