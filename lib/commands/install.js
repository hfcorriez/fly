const depcheck = require('depcheck2')
const fs = require('fs')
const path = require('path')

const dir = process.env.DIR ? path.resolve(process.env.DIR) : process.cwd()

module.exports = {
  main: async function (event, ctx) {

    try {
      let result = await new Promise(function (resolve, reject) {
        depcheck(dir, {}, (unused) => {
          resolve(unused)
        })
      })

      let missingPackages = []

      if (event.args['list-all']) {
        if (Object.keys(result.missing).length) {
          console.log(`All packages:\n- ${Object.keys(result.missing).join('\n- ')}`)
        } else {
          console.log('No packages.')
        }
      } else {
        Object.keys(result.missing).forEach(function (name) {
          if (!fs.existsSync(path.join(dir, `node_modules/${name}`))) missingPackages.push(name)
        })

        console.log((missingPackages.length ? `${missingPackages.length} packages need to install:\n- ${missingPackages.join('\n -')}` : 'no missing packages'))
      }

      if (missingPackages.length) {
        if (event.args.list) {
          console.log('\nrun "fly install" to install.')
        } else {
          console.log(`ready to install ${missingPackages.length} packages.`)

          await new Promise(function (resolve, reject) {
            let child = childProcess.spawn('npm', ['i', '--save'].concat(missingPackages), {
              cwd: dir,
              env: process.env,
              stdio: 'inherit'
            })

            child.on('close', (code) => {
              code ? reject(code) : resolve()
            })
          })
        }
      }
    } catch (err) {
      console.error(err)
    }
  },
  events: {
    command: {
      _: 'install',
      args: {
        '--list': Boolean,
        '--list-all': Boolean,
      }
    }
  }
}
