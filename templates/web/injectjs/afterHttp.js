module.exports = {
  async main (event, ctx) {
    event.headers = event.headers || {}
    const { string } = await ctx.ucfirst({ string: 'injectjs' })
    event.headers['x-powered-by'] = string
    if (typeof event.body === 'object') {
      event.body.injectjs = true
    }
    return event
  }
}
