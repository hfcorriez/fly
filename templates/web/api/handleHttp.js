module.exports = {
  main (event, ctx) {
    ctx.user = 'xxx'
    return event.query
  },

  catch (err) {
    return {
      body: {
        error: err.message
      }
    }
  }
}
