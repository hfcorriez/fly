module.exports = {
  main (event, ctx) {
    event.headers = event.headers || {}
    event.headers['x-powered-by'] = 'injectjs5'
    return event
  }
}
