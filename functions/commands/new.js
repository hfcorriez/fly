const path = require('path')
const fs = require('fs-extra')

module.exports = {
  main: async function (event) {
    const { force, source = 'http' } = event.args
    const dst = path.resolve(event.params[0] || '.')
    const src = path.join(__dirname, `../../templates/${source}`)

    if (!fs.existsSync(src)) {
      throw new Error(`source not found: ${source}`)
    }

    if (fs.existsSync(dst) && !force) {
      throw new Error(`dir exists: ${dst}`)
    }

    fs.ensureDir(dst)
    fs.copySync(src, dst)
    fs.writeFileSync(path.join(dst, 'package.json'), JSON.stringify({
      name: dst.split('/').pop(),
      version: '1.0.0',
      description: '',
      dependencies: {}
    }, null, 2))

    console.log(`▶ FLY project ready: ${dst}`)
  },

  configCommand: {
    _: 'new [dir]',
    args: {
      '--force': Boolean,
      '--source': String
    },
    alias: {
      '--source': '-s'
    },
    descriptions: {
      _: 'Create new fly project',
      '[dir]': 'Dir name',
      '--force': 'Force create when dir exists',
      '--source': 'Select source to create. support: http (default), project'
    }
  }
}
