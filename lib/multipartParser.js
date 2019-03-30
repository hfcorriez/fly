const { randomInt } = require('../lib/utils')
const fs = require('fs')
const path = require('path')
const mm = require('micromatch')
const through2 = require('through2')
const debug = require('debug')('fly/evt/htt')

/**
 * @param {Object} uploadConfig
 * @param {number} uploadConfig.maxSize -- optional, unit byte
 * @param {Array<string>} uploadConfig.allowTypes -- optional, micromatch format
 */
async function parseFormData (request, uploadConfig, rootTmpdir) {
  return new Promise((resolve, reject) => {
    const { maxSize, allowTypes } = uploadConfig
    const result = {
      files: [],
      fieldPairs: {}
    }
    const ssFactory = new SizeStreamFactory(maxSize) // 计算总文件大小，超出 maxSize 将抛错
    const fnameCounter = new CounterMap() // 上传重复文件名时进行编号
    const fCounter = new FileCounter(() => resolve(result)) //  统计文件是否已全部写入硬盘

    const tmpDir = path.join(rootTmpdir, '' + Date.now() + randomInt(4))
    fs.mkdir(tmpDir, (err) => {
      if (err) {
        debug(`make temp dir failed ${rootTmpdir}, ${err.message}`)
        reject(new Error(`make temp dir failed, tmpdir: ${tmpDir}, error: ${err.message}`))
      } else {
        const mp = request.multipart(fileHandler, done)
        mp.on('field', (key, value) => {
          result.fieldPairs[key] = value
        })
      }
    })

    function fileHandler (field, file, filename, encoding, mimetype) {
      fCounter.fileIn()
      // match mime
      if (allowTypes && !mm.any(mimetype, allowTypes)) {
        reject(new Error(`file type ${mimetype} is not allowd upload`))
      }
      // rename filename if need
      fnameCounter.set(filename)
      if (fnameCounter.get(filename) !== 1) {
        const { name, ext } = path.parse(filename)
        filename = `${name}(${fnameCounter.get(filename) - 1})${ext}`
      }
      const tmpfile = path.join(tmpDir, path.basename(filename))
      // handle file stream
      file.pipe(ssFactory.getStream())
        .on('error', function (err) { // file size error
          reject(err)
        })
        .pipe(fs.createWriteStream(tmpfile))
        .on('error', function (err) { // write tmp file error
          debug(`upload file failed, error: ${err.message}, field: ${field}, filename: ${filename}`)
          reject(err)
        })
        .on('close', function () { // 测下来 写入文件关闭  比 mp.done 要晚
          debug('close', Date.now())
          debug(`upload suc, field: ${field}, filename: ${filename}, tmpfile: ${tmpfile}`, Date.now())
          result.files.push(tmpfile)
          fCounter.tryResolve()
        })
    }

    function done (err) {
      debug('==done==', +Date.now())
      if (err) {
        reject(err)
      } else {
        fCounter.streamDone()
        fCounter.tryResolve() // 调用 tryResolve(), 预防 文件先关闭 的情况
      }
    }
  }) // return new Promise()
}

/**
 *
 * @param {Array<string>} files -- temp files uploaded
 */
async function deleteTempFiles (files) {
  if (files.length > 0) {
    // 文件
    debug(JSON.stringify(files, null, 4))
    await Promise.all(
      files.map(file => new Promise((resolve, reject) => {
        fs.unlink(file, err => {
          if (err) {
            debug(`ERROR: delete temp file (${file}) uploaded from user failed, error: ${err.message}`)
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
          debug(`ERROR: delete temp dir (${dir}) failed, error: ${err.message}`)
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

class SizeStreamFactory {
  constructor (maxSize) {
    this.size = 0
    this.maxSize = maxSize
  }
  getStream () {
    let self = this
    return through2(function (chunk, encoding, callback) {
      self.size += chunk.length
      this.push(chunk)
      const err = self.maxSize && self.size > self.maxSize ? new Error(`file size reached top limit: ${self.maxSize} KB`) : undefined
      callback(err)
    })
  }
}

class FileCounter {
  constructor (resolve) {
    this.isStreamDone = false
    this.count = 1 //  给 mp.done() 调用预留1
    this.resolve = resolve
  }
  tryResolve () {
    this.count--
    if (this.isStreamDone && this.count === 0) {
      this.resolve()
    }
  }
  fileIn () {
    this.count++
  }
  streamDone () {
    this.isStreamDone = true
  }
}

module.exports = {
  parseFormData,
  deleteTempFiles
}
