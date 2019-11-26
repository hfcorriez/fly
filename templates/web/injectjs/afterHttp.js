module.exports = {
  main (event, ctx) {
    event.headers = event.headers || {}
    event.headers['x-powered-by'] = 'injectjs5'
    if (typeof event.body === 'object') {
      event.body.injectjs = true
    }
    return event
  }
}
