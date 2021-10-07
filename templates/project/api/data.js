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

  async beforeHttp (event, ctx) {
    const { fly, hook } = ctx
    fly.info('execute data:beforeHttp')
    fly.super(event)
    hook('main', (r) => fly.info('log:', r.body.id))
    fly.info('ctx from super:', ctx.user)
    event.data = true
    return event
  },

  // Main
  async main (event, { eventId, '/lib/db': db, user, dayjs, fly, handleHttp }) {
    fly.info('execute data:main')
    return {
      body: {
        id: eventId,
        ctx: {
          handleHttp,
          user,
          db: db.create()
        },
        event,
        date: dayjs().format('YYYY-MM-DD'),
        env: process.env
      }
    }
  }
}
