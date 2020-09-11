const fs = require('fs')
const mime = require('mime')
const path = require('path')
const { URL } = require('url')
const fastify = require('fastify')()

module.exports = {
  configService: {
    name: 'File server',
    port: 5050
  },

  main (event) {
    const { bind, port } = event
    const root = path.resolve(event.dir || '.')

    fastify.route({
      method: ['GET'],
      url: '/*',
      handler: async (req, res) => {
        const urlObj = new URL('http://' + req.headers.host + req.raw.url)
        const pathname = decodeURIComponent(urlObj.pathname)
        const filePath = path.join(root, pathname)
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            const files = fs.readdirSync(filePath)
              .map(file => Object.assign(fs.statSync(path.join(filePath, file)), { name: file }))
              .sort((a, b) => (b.isDirectory() ? 1 : 0) - (a.isDirectory() ? 1 : 0) || (b.mtimeMs - a.mtimeMs))

            res.type('html').send([
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Index of ${pathname}</title>
  <style>
  * {
    font-size: 15px;
    -webkit-text-size-adjust: none;
  }
  body {
    padding: 30px;
  }
  a {
    text-decoration: none;
    color: #444;
  }
  a:hover {
    text-decoration: underline;
  }
  ul {
    padding: 10px;
    margin: 0;
  }
  li {
    word-break:break-all;
    width: 20%;
    float: left;
    height: 2em;
    line-height: 2em;
    list-style: none;
    overflow: hidden;
    margin-bottom: 10px;
    margin-right: 10px;
  }
  li a {
    margin-left: 5px;
  }
  @media (max-width: 1024px) {
    li {
      width: 45%;
    }
  }
  @media (max-width: 767px) {
    li {
      width: 100%;
      margin-right: 0;
    }
  }

  .file-icon {
    font-family: Arial, Tahoma, sans-serif;
    font-weight: 300;
    display: inline-block;
    width: 24px;
    height: 32px;
    background: #018fef;
    position: relative;
    border-radius: 2px;
    text-align: left;
    -webkit-font-smoothing: antialiased;
  }
  .file-icon::before {
    display: block;
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-bottom-left-radius: 2px;
    border-width: 5px;
    border-style: solid;
    border-color: #fff #fff rgba(255,255,255,.35) rgba(255,255,255,.35);
  }
  .file-icon::after {
    display: block;
    content: attr(data-type);
    position: absolute;
    bottom: 0;
    left: 0;
    font-size: 10px !important;
    color: #fff;
    text-transform: lowercase;
    width: 100%;
    padding: 2px;
    white-space: nowrap;
    overflow: hidden;
  }
  /* fileicons */
  .file-icon-xs {
    width: 12px;
    height: 16px;
    border-radius: 2px;
    font-size: 10px;
    line-height: 16px;
  }
  .file-icon-xs::before {
    border-bottom-left-radius: 1px;
    border-width: 3px;
  }
  .file-icon-xs::after {
    font-size: 12px;
    padding: 0;
    transform: scale(0.6);
  }
  .file-icon-sm {
    width: 18px;
    height: 24px;
    border-radius: 2px;
    line-height: 24px;
  }
  .file-icon-sm::before {
    border-bottom-left-radius: 2px;
    border-width: 4px;
  }
  .file-icon-sm::after {
    font-size: 12px;
    padding: 2px;
    transform: scale(0.833);
  }
  .file-icon-lg {
    width: 48px;
    height: 64px;
    border-radius: 3px;
  }
  .file-icon-lg::before {
    border-bottom-left-radius: 2px;
    border-width: 8px;
  }
  .file-icon-lg::after {
    font-size: 16px;
    padding: 4px 6px;
  }
  .file-icon-xl {
    width: 96px;
    height: 128px;
    border-radius: 4px;
  }
  .file-icon-xl::before {
    border-bottom-left-radius: 4px;
    border-width: 16px;
  }
  .file-icon-xl::after {
    font-size: 24px;
    padding: 4px 10px;
  }
  /* fileicon.types */
  .file-icon[data-type=zip],
  .file-icon[data-type=rar] {
    background: #acacac;
  }
  .file-icon[data-type^=doc] {
    background: #307cf1;
  }
  .file-icon[data-type^=xls] {
    background: #0f9d58;
  }
  .file-icon[data-type^=ppt] {
    background: #d24726;
  }
  .file-icon[data-type=pdf] {
    background: #e13d34;
  }
  .file-icon[data-type=txt] {
    background: #5eb533;
  }
  .file-icon[data-type=mp3],
  .file-icon[data-type=wma],
  .file-icon[data-type=m4a],
  .file-icon[data-type=flac] {
    background: #8e44ad;
  }
  .file-icon[data-type=mp4],
  .file-icon[data-type=wmv],
  .file-icon[data-type=mov],
  .file-icon[data-type=avi],
  .file-icon[data-type=mkv] {
    background: #7a3ce7;
  }
  .file-icon[data-type=bmp],
  .file-icon[data-type=jpg],
  .file-icon[data-type=jpeg],
  .file-icon[data-type=gif],
  .file-icon[data-type=png] {
    background: #f4b400;
  }
  </style>
</head>
<body>
<h2>Index of ${pathname}</h2>
<ul>`,
              (urlObj.pathname === '/' ? [] : ['..']).concat(files).map(file => {
                const name = typeof file === 'string' ? file : file.name
                const type = name.split('.').pop()
                const icon = (typeof file === 'string' || file.isDirectory()) ? '🗂' : `<div class="file-icon file-icon-xs" data-type="${type}"></div>`
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
      fastify.listen(port, bind, (err, address) => {
        if (err) return reject(err)
        resolve({ address, $command: { wait: true } })
      })
    })
  }
}
