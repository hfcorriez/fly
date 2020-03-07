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
  configHttp: {
    path: '/login'
  },

  // Main
  async main (_, { info, userLogin, error }) {
    let ret = await userLogin({ username: 'test', password: 'test' })
    info('some one start login')
    if (Math.random() > 0.5) {
      throw new Error('random value is greater than 0.5')
    }
    info('some one login ok')
    return {
      body: ret
    }
  }
}
