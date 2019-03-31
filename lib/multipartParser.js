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
    const sizeCounterFactory = new StreamSizeCounterFactory(maxSize) // 计算总文件大小，超出 maxSize 将抛错
    const filenameCounter = new CounterMap() // 上传重复文件名时进行编号
    const fileCounter = new FileCounter(() => resolve(result)) //  统计文件是否已全部写入硬盘

    const tmpDir = path.join(rootTmpdir, '' + Date.now() + randomInt(10000))
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
      fileCounter.fileIn()
      // match mime
      if (allowTypes && !mm.any(mimetype, allowTypes)) {
        reject(new Error(`file type ${mimetype} is not allowd upload`))
      }
      // rename filename if needed
      filenameCounter.set(filename)
      if (filenameCounter.get(filename) !== 1) {
        const { name, ext } = path.parse(filename)
        filename = `${name}(${filenameCounter.get(filename) - 1})${ext}`
      }
      const tmpfile = path.join(tmpDir, path.basename(filename))
      // handle file stream
      file.pipe(sizeCounterFactory.createStream(tmpfile))
        .on('error', function (err) { // file size error
          reject(err)
        })
        .pipe(fs.createWriteStream(tmpfile))
        .on('error', function (err) { // write tmp file error
          debug(`upload file failed, error: ${err.message}, field: ${field}, filename: ${filename}`)
          reject(err)
        })
        .on('close', function () { // 测下来 写入文件关闭  比 mp.done 要晚
          debug(`upload suc, field: ${field}, filename: ${filename}, tmpfile: ${tmpfile}`)
          result.files.push({
            field,
            encoding,
            mimetype,
            name: filename,
            path: tmpfile,
            size: sizeCounterFactory.getFileSize(tmpfile)
          })
          fileCounter.tryResolve()
        })
    }

    function done (err) {
      if (err) {
        reject(err)
      } else {
        fileCounter.streamDone()
        fileCounter.tryResolve() // 调用 tryResolve(), 预防 文件先关闭 的情况
      }
    }
  }) // return new Promise()
}

/**
 *
 * @param {Array<string>} files -- temp files uploaded
 */
async function deleteTempFiles (files) {
  if (Array.isArray(files) && files.length > 0) {
    setImmediate(function () {
      // 文件
      Promise.all(
        files.map(file => new Promise((resolve, reject) => {
          if (file && typeof file.path === 'string') {
            fs.unlink(file.path, err => {
              if (err) {
                debug(`delete temp file (${file}) uploaded from user failed, error: ${err.message}`)
              }
              resolve()
            })
          } else {
            debug(`delete temp file failed, file data lack of path prop ${JSON.stringify(file)}`)
            resolve()
          }
        }))
      ).then(() => {
        //  本次上传的临时文件夹（时间戳+随机数）
        if (typeof files[0].path === 'string') {
          const dir = path.dirname(files[0])
          fs.rmdir(dir, err => {
            if (err) {
              debug(`delete temp dir (${dir}) failed, error: ${err.message}`)
            } else {
              debug(`delete temp dir (${dir}) succeed`)
            }
          })
        }
      }).catch(debug)
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

class StreamSizeCounterFactory {
  constructor (maxSize) {
    this.total = 0
    this.sizeMap = new Map()
    this.maxSize = maxSize
  }
  createStream (path) {
    let self = this
    self.sizeMap.set(path, 0)
    return through2(function (chunk, encoding, callback) {
      self.total += chunk.length
      self.sizeMap.set(path, self.sizeMap.get(path) + chunk.length)
      this.push(chunk)
      const err = self.maxSize && self.total > self.maxSize ? new Error(`file size reached top limit: ${self.maxSize} KB`) : undefined
      callback(err)
    })
  }
  getFileSize (path) {
    return this.sizeMap.get(path)
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
