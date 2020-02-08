module.exports = {
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
