module.exports = {
  extends: './apiBase',
  imports: {
    b: './b'
  },
  async main (event, ctx) {
    return ctx.b({ a: true })
  },
  configHttp: {
    method: 'get',
    path: '/api/getA'
  }
}
