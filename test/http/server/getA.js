const lib = require('./lib/lib')

module.exports = {
  extends: './apiBase',
  imports: {
    flyFn: './flyFn.js'
  },
  async main (event, ctx) {
    console.log('main call', lib.c1)
    return ctx.flyFn({ a: true, lib: await lib.c1(2) })
  },
  configHttp: {
    method: 'get',
    path: '/api/getA'
  }
}
