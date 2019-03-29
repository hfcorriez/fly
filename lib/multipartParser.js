const { randomInt } = require('../lib/utils')
const fs = require('fs')
const path = require('path')
const mm = require('micromatch')
const pump = require('pump')
const debug = require('debug')('fly/evt/htt')

/**
 * @param {Object} uploadConfig
 * @param {number} uploadConfig.maxSize -- optional, unit byte
 * @param {Array<string>} uploadConfig.allowTypes -- optional, micromatch format
 */
async function parseFormData (request, uploadConfig, rootTmpdir) {
  return new Promise((resolve, reject) => {
    const files = []
    const fieldPairs = {}
    const { maxSize, allowTypes } = uploadConfig
    const busboyOpts = maxSize ? { limits: { fileSize: maxSize } } : {}
    const tmpDir = path.join(rootTmpdir, '' + Date.now() + randomInt(4))
    const counter = new CounterMap()
    function handler (field, file, filename, encoding, mimetype) {
      if (allowTypes && !mm.any(mimetype, allowTypes)) {
        reject(new Error(`file type ${mimetype} is not allowd upload`))
      }
      counter.set(filename)
      if (counter.get(filename) !== 1) {
        const { name, ext } = path.parse(filename)
        filename = `${name}(${counter.get(filename) - 1})${ext}`
      }
      const tmpfile = path.join(tmpDir, path.basename(filename))
      // file.on('limit', () {
      //   console.log(1)
      // })
      pump(file, fs.createWriteStream(tmpfile), function (err) {
        if (err) {
          debug(`upload failed, field: ${field}, filename: ${filename}`, err)
          reject(err)
        }
        debug(`upload suc, field: ${field}, filename: ${filename}`)
      })
      files.push(tmpfile)
    }
    function done (err) {
      if (err) {
        reject(err)
      } else {
        resolve({ files, fieldPairs })
      }
    }
    fs.mkdir(tmpDir, (err) => {
      if (err) {
        debug(`make temp dir failed ${rootTmpdir}, ${err.message}`)
        return reject(err)
      } else {
        // mp is an instance of busboy
        const mp = request.multipart(handler, done, busboyOpts)
        mp.on('field', (key, value) => {
          fieldPairs[key] = value
        })
        mp.on('limit', function () {
          debug(`file size reached top limit ${maxSize} KB`)
          reject(new Error(`file size exceed top limit`))
        })
      }
    })
  })
}

/**
 *
 * @param {Array<string>} files -- temp files uploaded
 */
async function deleteTempFiles (files) {
  if (files.length > 0) {
    // 文件
    await Promise.all(
      files.map(file => new Promise((resolve, reject) => {
        fs.unlink(file, err => {
          if (err) {
            debug(`ERROR: delete temp file (${file}) uploaded from user failed`)
          }
          resolve()
        })
      }))
    )
    //  本次上传的临时文件夹（时间戳+随机数）
    await new Promise((resolve, reject) => {
      const dir = path.dirname(files[0])
      fs.rmdir(dir, err => {
        if (err) {
          debug(`ERROR: delete temp file (${dir}) failed`)
        }
        resolve()
      })
    })
  }
}

class CounterMap extends Map {
  set (key) {
    if (!this.has(key)) {
      super.set(key, 1)
    } else {
      super.set(key, this.get(key) + 1)
    }
  }
}

module.exports = {
  parseFormData,
  deleteTempFiles
}
