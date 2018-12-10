const fs = require('fs')
const mime = require('mime')

exports.main = async function (event, ctx, next) {
  let body = await next()

  if (!body) {
    return false
  }

  if (body.file) {
    let path = body.file
    let data = fs.readFileSync(path)

    return {
      status: 200,
      type: body.type || mime.getType(path),
      headers: body.headers || null,
      body: data
    }
  }

  return body
}
