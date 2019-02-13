const path = require('path')
const fs = require('fs-extra')

module.exports = {
  main: async function (event, ctx) {
    let dst = path.resolve(event.params[0] || '.')
    let src = path.join(__dirname, '../templates/web')

    if (fs.existsSync(dst) && !event.args.force) {
      console.log('dir exists.')
      return false
    }

    try {
      fs.ensureDir(dst)
      fs.copySync(src, dst)
      fs.writeFileSync(path.join(dst, 'package.json'), JSON.stringify({
        name: dst.split('/').pop(),
        version: '1.0.0',
        description: '',
        dependencies: {}
      }, null, 2))

      console.log(`FLY Project created: ${dst}.`)
    } catch (err) {
      console.log(`FLY Project create failed: ${err.message}`)
      return false
    }
  },

  configCommand: {
    _: 'new [dir]',
    args: {
      '--force': Boolean
    },
    descriptions: {
      _: 'Create new service dir',
      '[dir]': 'Dir name',
      '--force': 'Force create when dir exists'
    }
  }
}
