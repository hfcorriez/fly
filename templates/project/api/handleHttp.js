module.exports = {
  beforeHttp (event, { fly }) {
    fly.info('start handleHttp:beforeHttp')
    event.handled = true
    return event
    // return ctx.fly.end({ body: 'haha1' })
  },

  main (event, ctx) {
    ctx.user = { name: 'main' }
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
