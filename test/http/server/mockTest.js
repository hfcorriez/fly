const lib = require('./lib/lib')

module.exports = {
  extends: './apiBase',
  imports: {
    flyFn: './flyFn.js'
  },
  async main (event, ctx) {
    console.log('main call', lib.c1)
    return {
      ...await ctx.flyFn(),
      ...await lib.libFn()
    }
  },
  configHttp: {
    method: 'get',
    path: '/api/mockTest'
  }
}
