module.exports = {
  extends: './index',

  functions: {
    userLogin: '../common/userLogin'
  },

  async main (event, ctx) {
    let ret = await ctx.userLogin({ username: 'test', password: 'test' })
    return ret
  },

  configHttp: {
    method: 'get',
    path: '/api/userLogin'
  }
}
