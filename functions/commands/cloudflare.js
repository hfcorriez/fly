const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '../../')
const uglify = require('uglify-js')

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
          functions: []
        }
      }
      workers[workerConfig.worker].functions.push(fn)
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
          const workerFnCode = 'const FLY_STORE = {\n' + Object.keys(codes).map(key => {
            return `'${key}': ${codes[key]},\n`
          }).join('\n') + '\n}'

          console.log('Functions:', Object.keys(codes))

          try {
            const buildFile = worker.compileFile.replace('.js', '.orig.js')
            const code = workerCode.replace('const FLY_STORE = {}', workerFnCode)
            fs.writeFileSync(buildFile, code)
            console.log('Build File: ', buildFile)
            const compileCode = uglify.minify(code)
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
