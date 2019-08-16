module.exports = {
  main (event) {
    return true
  },

  after (event) {
    return (event && event.redirect) ? event : {
      body: { code: 0, data: event }
    }
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
