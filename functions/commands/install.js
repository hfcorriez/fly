const depcheck = require('depcheck2')
const path = require('path')
const childProcess = require('child_process')
const dir = process.env.DIR ? path.resolve(process.env.DIR) : process.cwd()

module.exports = {
  async main (event, ctx) {
    try {
      let result = await new Promise((resolve, reject) => depcheck(dir, {}, unused => resolve(unused)))
      let missingPackages = Object.keys(result.missing)

      if (event.args.list) {
        console.log('[Dependecy packages]')
        Object.keys(result.missing).forEach(k => console.log(` * ${k}`))
        Object.keys(result.using).forEach(k => console.log(` - ${k}`))
        console.log(`\n# ${missingPackages.length} packages to install`)
      }

      if (missingPackages.length) {
        if (event.args.list) {
          console.log('\n# Run "fly install" to install.')
        } else {
          console.log(`# Ready to install ${missingPackages.length} packages.`)

          await new Promise((resolve, reject) => {
            let child = childProcess.spawn('npm', ['i', '--save'].concat(missingPackages), {
              cwd: dir,
              env: process.env,
              stdio: 'inherit'
            })

            child.on('close', (code) => code ? reject(code) : resolve())
          })
        }
      }
    } catch (err) {
      console.error(err)
    }
  },

  configCommand: {
    _: 'install',
    args: {
      '--list': Boolean
    },
    alias: {
      '--list': '-l'
    },
    descriptions: {
      _: 'Install deps',
      '--list': 'List packages to install'
    }
  }
}
