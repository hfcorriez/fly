require('module-alias/register')
const rewire = require('rewire')

module.exports = {
  file: __filename,
  fly: {
    flyFn: async (event) => {
      return {
        fly: 'mock fly value'
      }
    }
  },
  lib: {
    '@server/lib/lib.js': {
      async libFn (i) {
        const lib = rewire('./server/lib/lib.js')
        lib.__set__('store', { value: 'mock lib value' })
        return {
          lib: lib.__get__('store').value,
          rewired
        }
      }
    }
  },
  reload: [
    '@server/mockTest.js'
  ]
}

var rewired = false
