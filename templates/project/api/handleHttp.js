module.exports = {
  beforeHttp (event, ctx) {
    return ctx.end({ body: 'haha' })
  },

  main (event, ctx) {
    ctx.user = { name: 'x' }
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
