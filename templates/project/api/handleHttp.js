module.exports = {
  beforeHttp (event, ctx) {
    ctx.fly.info('execute handleHttp:beforeHttp')
    event.handleHttp = true
    ctx.user = { name: 'main' }
    return event
    // return ctx.fly.end({ body: 'haha1' })
  },

  main (event, ctx) {
    ctx.fly.info('execute handleHttp:main')
    return event.method === 'post' ? event.body : event.query
  },

  catch (err) {
    return {
      body: {
        error: err.message
      }
    }
  }
}
