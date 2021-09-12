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
  extends: 'handleHttp',

  // Http default config
  configHttp: {
    method: 'get,post',
    path: '/data'
  },

  async beforeHttp (event, { fly }) {
    fly.info('start data beforeHttp')
    event = await fly.super(event)
    event.data = true
    return event
  },

  // Main
  async main (event, { eventId, db, user, dayjs, fly }) {
    fly.info('start data main')
    return {
      body: {
        id: eventId,
        db: db.create(),
        event,
        user,
        date: dayjs().format('YYYY-MM-DD')
      }
    }
  }
}
