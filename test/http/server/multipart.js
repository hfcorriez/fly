const fs = require('fs')
const { promisify } = require('util')
const assert = require('assert')
const debug = require('debug')('fly/evt/htt')

const stat = promisify(fs.stat)

module.exports = {

  extends: './apiBase',

  async main (event) {
    const { body, files } = event
    const { f1, f2, f3 } = body
    if (f1) {
      assert.strictEqual(f1, 'v1')
    }
    if (f2) {
      assert.strictEqual(f2, 'v2')
    }
    if (f3) {
      assert.strictEqual(f3, 'v3')
    }

    debug(files)
    if (files) {
      await Promise.all(
        files.map(file =>
          stat(file.path).then(data => {
            assert.strictEqual(data.size, file.size)
            assert(Date.now() - +new Date(data.birthtime) < 10000)
          })
        )
      )
    }
    return { files }
  },
  configHttp: {
    method: 'post',
    path: '/api/testMultipart',
    upload: {
      maxSize: 5242880, // 5MB
      allowTypes: ['image/*', 'text/html']
      // allowTypes: ['*/*']
    }
  }

}
