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
  beforeHttp: 'handleHttp',

  // Http default config
  configHttp: {
    path: '/data'
  },

  imports: {
    db: '../lib/db'
  },

  // Main
  async main (event, ctx) {
    return {
      body: {
        db: ctx.db.create(),
        event,
        user: ctx.user
      }
    }
  }
}
