module.exports = {
  components: {
    injectjs: {
      dir: '../injectjs'
    }
  },

  main (event) {
    return { code: 0 }
  },

  afterHttp (event) {
    return event.redirect ? event : { body: event }
  },

  error (err) {
    return {
      body: { code: 1, message: err ? err.message : 'unknown error' }
    }
  },

  configHttp: {
    method: 'GET',
    path: '/api',
    cors: true
  }
}
