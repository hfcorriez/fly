module.exports = {
  // Extends from other function
  extends: './index',

  // Declare functions you will used from file, package, github, url
  functions: {
    userLogin: '../common/userLogin'
  },

  async main (event, ctx) {
    let ret = await ctx.userLogin({ username: 'test', password: 'test' })
    return ret
  },

  configHttp: {
    method: 'get',
    path: '/api/userLogin',
    cors: true
  }
}
