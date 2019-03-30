const assert = require('assert')
const path = require('path')
const fs = require('fs')
const FormData = require('form-data')
const axios = require('axios')

const url = 'http://localhost:8080/api/testMultipart'
const opts = {
  method: 'POST',
  url,
  headers: {
    'Content-Type': 'application/json'
  }
}
const SMALL_FILE = path.join(__dirname, '../tmp/image_1.9M.png')
const LARGE_FILE = path.join(__dirname, '../tmp/image_3.3M.png')
const ZIP_FILE = path.join(__dirname, '../tmp/image_3.3M.zip')

function buildFormData () {
  const formData = new FormData()
  formData.append('f1', 'v1')
  formData.append('f2', 'v2')
  formData.append('f3', 'v3')
  return formData
}

/**
 *  # run script first
 * $ export DEBUG=fly/evt/htt; ../../../bin/fly.js http
 */

/* eslint-env node, mocha */
describe('post multipart/form-data', function () {
  this.timeout(5000)

  it('1. post json suc', async () => {
    const res = await axios({ ...opts, data: JSON.stringify({ f1: 'v1', f2: 'v2', f3: 'v3' }) })
      .catch(err => {
        assert.ifError(err)
      })
    assert.strictEqual(res.data.code, 0)
    assert.strictEqual(res.data.data.files, undefined)
    assert.strictEqual(res.status, 200)
  })

  it('2. post fields without file suc', async () => {
    const formData = buildFormData()
    const res = await axios({ ...opts, data: formData, headers: formData.getHeaders() })
      .catch(err => {
        assert.ifError(err)
      })
    assert.strictEqual(res.data.code, 0)
    assert.strictEqual(res.data.data.files.length, 0)
    assert.strictEqual(res.status, 200)
  })

  it('3. post files without field suc', async () => {
    const formData = new FormData()
    formData.append('attachments[]', fs.createReadStream(SMALL_FILE))
    formData.append('attachments[]', fs.createReadStream(SMALL_FILE))
    const res = await axios({ ...opts, data: formData, headers: formData.getHeaders() })
      .catch(err => {
        assert.ifError(err)
      })
    assert.strictEqual(res.data.code, 0)
    assert.strictEqual(res.data.data.files.length, 2)
    assert.strictEqual(res.status, 200)
  })

  it('4. post field with file suc', async () => {
    const formData = buildFormData()
    formData.append('attachments[]', fs.createReadStream(SMALL_FILE))
    formData.append('attachments[]', fs.createReadStream(SMALL_FILE))
    const res = await axios({ ...opts, data: formData, headers: formData.getHeaders() })
      .catch(err => {
        assert.ifError(err)
      })
    assert.strictEqual(res.data.code, 0)
    assert.strictEqual(res.data.data.files.length, 2)
    assert.strictEqual(res.status, 200)
  })

  it('5. post file too large failed', async () => {
    const formData = buildFormData()
    formData.append('attachments[]', fs.createReadStream(LARGE_FILE))
    formData.append('attachments[]', fs.createReadStream(LARGE_FILE))
    let catchErr = 0
    await axios({ ...opts, data: formData, headers: formData.getHeaders() })
      .catch(err => {
        assert.strictEqual(err.response.data.code, 500)
        assert.strictEqual(err.response.data.message, 'file size reached top limit: 5242880 KB')
        catchErr = 1
      })
    assert.strictEqual(catchErr, 1)
  })

  it('6. post file which mime type not allow failed', async () => {
    const formData = buildFormData()
    formData.append('attachments', fs.createReadStream(ZIP_FILE))
    let catchErr = 0
    await axios({ ...opts, data: formData, headers: formData.getHeaders() })
      .catch(err => {
        assert.strictEqual(err.response.data.code, 500)
        assert.strictEqual(err.response.data.message, 'file type application/zip is not allowd upload')
        catchErr = 1
      })
    assert.strictEqual(catchErr, 1)
  })
})
