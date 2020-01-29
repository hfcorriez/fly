const fs = require('fs')
const mime = require('mime')
const path = require('path')
const { URL } = require('url')
const fastify = require('fastify')()

module.exports = {
  configService: {
    name: 'web',
    title: 'Web server'
  },

  main (event) {
    const { bind, port } = event
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
  <style>
  html {
    font-size: 14px;
  }
  a {
    text-decoration: none
  }
  a:hover {
    text-decoration: underline
  }
  li {
    width: 250px;
    float: left;
    line-height: 2em;
  }
  </style>
</head>
<body>
<h3>${urlObj.pathname}</h3>
<ul>`,
              (urlObj.pathname === '/' ? [] : ['..']).concat(files).map(file => {
                const icon = (typeof file === 'string' || file.isDirectory()) ? '📔' : '🧾'
                const name = typeof file === 'string' ? file : file.name
                return `<li><a href="${path.join(urlObj.pathname, name)}">${icon} ${name}</a></li>`
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
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)
        resolve({ address })
      })
    })
  }
}
