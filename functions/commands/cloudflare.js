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

    switch (action) {
      case 'compile':
        for (const name in workers) {
          const worker = workers[name]
          const workerFns = worker.functions
          const workerCode = fs.readFileSync(path.join(root, 'faas/cloudflare/cloudflareWorker.js'), 'utf8')
          const workerFnCode = 'const functions = {\n' + workerFns.map(fn => {
            return `${fn.name}: function() {${fs.readFileSync(fn.file, 'utf8')
              // change module to return
              .replace(/module.exports =/, '\nreturn')
              // remove configcloudflare
              .replace(/\n\s+configCloudflare:\s*{[\s\S+]+?},\n/m, '')
            }},`
          }).join('\n') + '\n}'

          try {
            const compileCode = uglify.minify(workerCode.replace('const functions = {}', workerFnCode))
            fs.writeFileSync(worker.compileFile, compileCode.code)
            console.log('compile to: ', worker.compileFile)
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
            console.log('▶ Cloudflare')
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
