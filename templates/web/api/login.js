module.exports = {
  // Extends from other function
  extends: './index',

  // Declare functions you will used from file, package, github, url
  imports: {
    userLogin: '../common/userLogin'
  },

  async main (event, ctx) {
    let ret = await ctx.userLogin({ username: 'test', password: 'test' })
    if (Math.random() > 0.5) {
      ctx.error(new Error('random value is greater than 0.5, will log by sentry'))
    }
    return ret
  },

  configHttp: {
    method: 'get',
    path: '/api/userLogin',
    cors: true
  }
}
