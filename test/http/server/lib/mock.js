require('module-alias/register')
const rewire = require('rewire')

module.exports = {
  file: __filename,
  fly: {
    flyFn: async (event) => {
      return { email: 'c@c.com', ...event }
    }
  },
  lib: {
    '@server/lib/lib.js': {
      async c1 (i) {
        const lib = rewire('./lib.js')
        return lib.__get__('v').c * 2 + i * 3
      }
    }
  },
  reload: [
    '@server/getA.js'
  ]
}
