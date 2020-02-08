/**
 * 问题梳理
 *
 * 1、如何转换输入
 * 2、如何转换输出
 * 3、如何拦截输入：throw error
 * 4、如何配置到函数内
 * 5、上下文如何利用
 *
 */

module.exports = {
  // Main
  async main (_, ctx) {
    let ret = await ctx.userLogin({ username: 'test', password: 'test' })
    if (Math.random() > 0.5) {
      ctx.error(new Error('random value is greater than 0.5, will log by sentry'))
    }
    return ret
  }
}
