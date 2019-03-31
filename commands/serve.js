const fs = require('fs')
const mime = require('mime')
const path = require('path')
const { URL } = require('url')
const fastify = require('fastify')()

module.exports = {
  extends: './server',

  config: {
    command: 'serve',
    name: 'Serve',
    port: 8000,
    address: '127.0.0.1'
  },

  run: function (event) {
    const root = path.resolve(event.dir || '.')
    fastify.route({
      method: ['GET'],
      url: '/*',
      handler: async (req, res) => {
        const urlObj = new URL('http://' + req.headers.host + req.raw.url)
        const filePath = path.join(root, decodeURIComponent(urlObj.pathname.substr(1)))
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            const files = fs.readdirSync(filePath)
              .map(file => Object.assign(fs.statSync(path.join(filePath, file)), { name: file }))
              .sort((a, b) => (b.isDirectory() ? 1 : 0) - (a.isDirectory() ? 1 : 0))

            res.type('html').send([
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${urlObj.pathname}</title>
</head>
<body>
<h3>${filePath}</h3>
<ul>`,
              (urlObj.pathname === '/' ? [] : ['..']).concat(files).map(file => {
                const icon = (typeof file === 'string' || file.isDirectory()) ? '📔' : '🧾'
                const name = typeof file === 'string' ? file : file.name
                return `<li>${icon} <a href="${path.join(urlObj.pathname, name)}">${name}</a></li>`
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
      const port = this.config.port
      const address = this.config.address
      fastify.listen(port, address, (err, address) => {
        if (err) return reject(err)
        resolve({ address })
      })
    })
  }
}
