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
  decorator: 'api',

  configHttp: {
    path: '/login'
  },

  beforeHttp (event) {
    event.username = 'abc'
    event.password = 'abc'
    return event
  },

  props: {
    username: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    }
  },

  // Main
  async main ({ username, password }, { fly, userLogin, set }) {
    fly.log('login', username)
    // fly.validate('www.google.com', 'url', 'url valid failed')
    set('login', username)

    let ret = await userLogin({ username: 'test', password: 'test' })
    fly.info('some one start login')
    if (Math.random() > 0.5) {
      throw new Error('random value is greater than 0.5')
    }
    fly.info('some one login ok')
    return ret
  }
}
