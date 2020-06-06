const lib = require('./lib/lib')

module.exports = {
  extends: 'apiBase',
  async main (event, ctx) {
    console.log('main call', lib.libFn)
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