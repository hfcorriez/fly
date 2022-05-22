const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '../../')
const uglify = require('uglify-js')
const { resolve } = require('path')
const { readdir } = require('fs').promises
const mime = require('mime-types')

const EXT_TXT = ['js', 'json', 'txt', 'text', 'html', 'html', 'mustache', 'vue', 'react', 'jsx', 'conf', 'ini', 'css', 'scss', 'less', 'md', 'markdown', 'shtml']
const EXT_BIN = ['png', 'jpg', 'gif', 'jpeg', 'svg', 'ico', 'appicon']

module.exports = {
  configCommand: {
    _: 'cloudflare <action>',
    args: {
    },
    descriptions: {
      '_': 'Call function',
      '<action>': 'deploy | test'
    }
  },

  async main ({ params: { action } }, { fly, callCloudflareApi }) {
    const config = fly.project.cloudflare
    if (!config) throw new Error('project.cloudflare config not found')

    const fns = fly.find('cloudflare')
    if (!fns || !fns.length) throw new Error('no cloudflare functions')

    const flyCacheDir = require('os').homedir() + '/.cache/fly'
    if (!fs.existsSync(flyCacheDir)) fs.mkdirSync(flyCacheDir)

    const workers = {}
    for (const fn of fns) {
      const workerConfig = fn.events.cloudflare
      if (!workers[workerConfig.worker]) {
        workers[workerConfig.worker] = {
          compileFile: `${flyCacheDir}/cloudflare-${workerConfig.worker}.js`,
          functions: [],
          mounts: []
        }
      }
      workers[workerConfig.worker].functions.push(fn)
      if (workerConfig.mount) {
        workers[workerConfig.worker].mounts.push(workerConfig.mount)
      }
    }

    console.log('▶ Cloudflare ' + action)
    switch (action) {
      case 'compile':
        for (const name in workers) {
          const codes = {}
          const worker = workers[name]
          const workerFns = worker.functions
          const workerCode = fs.readFileSync(path.join(root, 'faas/cloudflare/cloudflareWorker.js'), 'utf8')
          workerFns.forEach(fn => loadCode(fn, fly, codes))
          for (const mount of worker.mounts) {
            const files = await getFiles(path.join(fly.root, mount))
            for (const file of files) {
              const ext = file.split('.').pop()
              const fileName = file.replace(fly.root, '')
              let fileCode = ''
              const contentType = mime.lookup(ext)

              if (EXT_TXT.includes(ext)) {
                fileCode = fs.readFileSync(file, 'base64')
              } else if (EXT_BIN.includes(ext)) {
                fileCode = fs.readFileSync(file, 'base64')
              }

              if (fileCode && fileCode.length > 300000) {
                console.warn('[warn] ignore ' + fileName + ' because it is over 100k')
                continue
              }

              if (fileCode) {
                codes[fileName] = `'${contentType}:${fileCode}'`
              }
            }
          }

          const workerFnCode = 'const FLY_STORE = {\n' + Object.keys(codes).map(key => {
            return `'${key}': ${codes[key]},\n`
          }).join('\n') + '\n}'

          console.log('Files:', Object.keys(codes))

          try {
            const buildFile = worker.compileFile.replace('.js', '.orig.js')
            const origCode = workerCode.replace('const FLY_STORE = {}', workerFnCode)
            fs.writeFileSync(buildFile, origCode)
            const compileCode = uglify.minify(origCode)
            console.log('Build File: ', buildFile)
            if (!compileCode.code) {
              throw new Error(compileCode)
            }
            if (compileCode.code.length > 1000000) {
              throw new Error('deploy file is too large:', compileCode.code.length)
            }
            fs.writeFileSync(worker.compileFile, compileCode.code)
            console.log('Compile File: ', worker.compileFile)
          } catch (err) {
            console.error('compile error', err)
          }
        }
        break
      case 'deploy':
        const res = await callCloudflareApi({
          account: config.id,
          email: config.email,
          key: config.key,
          method: 'get',
          path: `/workers/subdomain`
        })

        const domain = res.subdomain + '.workers.dev'

        for (const name in workers) {
          const worker = workers[name]

          try {
            const data = fs.readFileSync(worker.compileFile)
            await callCloudflareApi({
              account: config.id,
              email: config.email,
              key: config.key,
              method: 'put',
              type: 'application/javascript',
              data,
              path: `/workers/scripts/${name}`
            })
            console.log('URL:', `https://${name}.${domain}`)
            console.log('Functions:', worker.functions.map(fn => 'http:' + fn.events.http.path + ' > ' + fn.name))
            console.log('Size:', data.length)

            console.log('(PS: if you create a new worker, please setup route and wait a few minutes for the worker to be ready', `https://dash.cloudflare.com/${config.id}/workers/services/view/${name}/production/triggers`, ')')
          } catch (err) {
            console.error(name, 'deploy error', err)
          }
        }
    }
  }
}

function loadCode (fn, fly, codes = {}) {
  if (typeof fn === 'string' && fn.startsWith('@')) {
    let moduleCode = fs.readFileSync(path.join(fly.root, fn.substring(1) + '.js'), 'utf8')

    if (!moduleCode.includes('module.exports =')) {
      moduleCode += '\nreturn exports'
    }

    codes[fn] = `function() {${
      moduleCode
      // change module to return
        .replace(/module.exports =/, '\nreturn')
      // remove configcloudflare
        .replace(/\n\s+configCloudflare:\s*{[\s\S+]+?},\n/m, '')
    }}()`
    return codes
  }

  const fnCode = fs.readFileSync(fn.file, 'utf8')
  const contextRegex = /,\s*\{([\S\s]+?)\}/m
  const contextMatched = contextRegex.exec(fnCode)
  if (contextMatched) {
    contextMatched[1].split(',')
      .map(p => p.trim().split(':').shift().trim().replace(/('|")/g, ''))
      .filter(k => !['cloudflare', 'fly'].includes(k))
      .forEach(name => {
        if (codes[name]) return
        if (name.startsWith('@')) {
          loadCode(name, fly, codes)
        } else {
          const fn = fly.get(name)
          !fn && console.log('fn', name)
          loadCode(fn, fly, codes)
        }
      })
  }
  codes[fn.name] = `function() {${
    fnCode
    // change module to return
      .replace(/module.exports =/, '\nreturn')
    // remove configcloudflare
      .replace(/\n\s+configCloudflare:\s*{[\s\S+]+?},\n/m, '')
  }}()`
  return codes
}

async function getFiles (dir) {
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(dirents.map((dirent) => {
    const res = resolve(dir, dirent.name)
    return dirent.isDirectory() ? getFiles(res) : res
  }))
  return Array.prototype.concat(...files)
}
