const { randomInt, logger } = require('./utils')
const fs = require('fs')
const path = require('path')
const mm = require('micromatch')
const through2 = require('through2')

const info = logger('▶httpupload', 'info')

const TMP_DIR = path.join(require('os').tmpdir(), 'fly-uploads')
const ONE_HUNDRED_MEGA_BYTE = 100 * 1024 * 1024

/**
 * @param {Object} uploadConfig
 * @param {number} uploadConfig.maxSize -- optional, unit byte
 * @param {Array<string>} uploadConfig.allowTypes -- optional, micromatch format
 */
async function handleUpload (request, uploadConfig) {
  try {
    !fs.existsSync(TMP_DIR) && fs.mkdirSync(TMP_DIR)
  } catch (err) {
    throw new Error(`upload dir create failed: ${TMP_DIR} ${err.message}`)
  }

  return new Promise((resolve, reject) => {
    const { allowTypes, maxSize = ONE_HUNDRED_MEGA_BYTE } = typeof uploadConfig === 'object' ? uploadConfig : {}
    const result = {
      files: {},
      fieldPairs: {},
    }

    const tmpDir = path.join(TMP_DIR, '' + Date.now() + randomInt(10000))
    // 计算总文件大小，超出 maxSize 将抛错
    const sizeCounterFactory = new StreamSizeCounterFactory(maxSize)
    // 上传重复文件名时进行编号
    const filenameCounter = new CounterMap()
    //  统计文件是否已全部写入硬盘，并处理文件写入、文件类型、文件太大等异常
    const fileDoneCounter = new FileDoneCounter(() => {
      if (Object.keys(result.files).length === 0) {
        deleteTempDir(tmpDir)
      }
      resolve(result)
    }, (err) => reject(err)
    , () => deleteTempDir(tmpDir))

    fs.mkdir(tmpDir, (err) => {
      if (err) {
        info(`make temp dir failed ${TMP_DIR}, ${err.message}`)
        fileDoneCounter.tryReject(new Error(`make temp dir failed, tmpdir: ${tmpDir}, error: ${err.message}`))
      } else {
        const mp = request.multipart(fileHandler, done)
        mp.on('field', (key, value) => {
          result.fieldPairs[key] = value
        })
      }
    })

    function deleteTempDir (dir) {
      fs.readdir(dir, (err, files) => {
        if (err) {
          info(`tmpDir not found, ${dir}, error: ${err.message}`)
        }
        const filesObj = files.reduce((acc, file) => {
          const p = path.join(dir, file)
          _addFile(acc, file, { path: p })
          return acc
        }, {})
        if (files.length > 0) {
          cleanUploadFiles(filesObj)
        } else {
          fs.rmdir(dir, err => {
            if (err) {
              info(`delete temp dir (${dir}) failed, error: ${err.message}`)
            } else {
              info(`delete temp dir (${dir}) succeed`)
            }
          })
        }
      })
    }

    function fileHandler (field, file, filename, encoding, mimetype) {
      fileDoneCounter.fileIn()
      // match mime
      if (allowTypes && !mm.any(mimetype, allowTypes)) {
        fileDoneCounter.tryReject(new Error(`file type ${mimetype} is not allowd upload`))
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
          fileDoneCounter.tryReject(err)
        })
        .pipe(fs.createWriteStream(tmpfile))
        .on('error', function (err) { // write tmp file error
          info(`upload file failed, error: ${err.message}, field: ${field}, filename: ${filename}`)
          fileDoneCounter.tryReject(err)
        })
        .on('close', function () { // 测下来 写入文件关闭  比 mp.done 要晚
          info(`upload suc, field: ${field}, filename: ${filename}, tmpfile: ${tmpfile}`)
          _addFile(result.files, field, {
            field,
            encoding,
            mimetype,
            name: filename,
            path: tmpfile,
            size: sizeCounterFactory.getFileSize(tmpfile),
          })
          fileDoneCounter.tryResolve()
        })
    }

    function done (err) {
      if (err) {
        fileDoneCounter.tryReject(err)
      } else {
        fileDoneCounter.tryResolve() // 调用 tryResolve(), 1. 预防 文件先关闭 的情况 2. 如果使用了 multipart/form-data 头，但没上传文件，在这里触发
      }
    }
  }) // return new Promise()
}

/**
 *
 * @param {{ field: Array<File> | File}} files -- temp files uploaded
 */
async function cleanUploadFiles (files) {
  if (typeof files === 'object') {
    const fileList = _toFileList(files)
    setImmediate(function () {
      // 文件
      Promise.all(
        fileList.map(file => new Promise((resolve, reject) => {
          if (file && typeof file.path === 'string') {
            fs.unlink(file.path, err => {
              if (err) {
                info(`delete temp file (${file}) uploaded from user failed, error: ${err.message}`)
              }
              resolve()
            })
          } else {
            info(`delete temp file failed, file data lack of path prop ${JSON.stringify(file)}`)
            resolve()
          }
        })),
      ).then(() => {
        //  本次上传的临时文件夹（时间戳+随机数）
        if (fileList.length > 0) {
          const firstFile = fileList[0].path
          if (typeof firstFile === 'string') {
            const dir = path.dirname(firstFile)
            fs.rmdir(dir, err => {
              if (err) {
                info(`delete temp dir (${dir}) failed, error: ${err.message}`)
              } else {
                info(`delete temp dir (${dir}) succeed`)
              }
            })
          }
        }
      }).catch(info)
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
      const err = self.maxSize && self.total > self.maxSize ? new Error(`file size reached top limit: ${self.maxSize / 1024} KB`) : undefined
      callback(err)
    })
  }
  getFileSize (path) {
    return this.sizeMap.get(path)
  }
}

/**
 * count whether all files done, if true, call resovle(result)
 * if there is an error hanppens, keep it until all files done, remove all tmp files, call reject(err)
 */
class FileDoneCounter {
  constructor (resolve, reject, beforeRejection) {
    this.allStreamDone = false
    this.count = 1 //  给 mp.done() 调用预留1
    this.error = undefined
    this.resolve = resolve
    this.reject = reject
    this.beforeReject = beforeRejection
  }
  tryResolve () {
    this.count--
    if (this._allDoneWithError()) {
      this.beforeReject()
      this.reject(this.error)
    } else if (this.count === 0) {
      this.resolve()
    }
  }
  _allDoneWithError () { //  保守的做法，捕获异常后，保证其他文件已经完成了再清除临时文件
    return this.error && (this.count === 0 || (this.count === 1 && !this.allStreamDone))
  }
  fileIn () {
    this.count++
  }
  streamDone () {
    this.allStreamDone = true
  }
  tryReject (err) {
    this.count--
    this.error = err
    if (this._allDoneWithError()) {
      this.beforeReject()
      this.reject(this.error)
    }
  }
}

function _addFile (files, field, file) {
  if (files[field]) {
    if (Array.isArray(files[field])) {
      files[field].push(file)
    } else {
      files[field] = [files[field], file]
    }
  } else {
    files[field] = file
  }
}

function _toFileList (files) {
  return Object.values(files).reduce((acc, v) => {
    if (Array.isArray(v)) {
      acc.push(...v)
    } else {
      acc.push(v)
    }
    return acc
  }, [])
}

module.exports = {
  handleUpload,
  cleanUploadFiles,
  contentTypeRegex: /^multipart\/form-data/i,
}
