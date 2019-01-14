module.exports = {
  main (event) {
    return true
  },

  after (event) {
    return {
      body: { code: 0, data: event }
    }
  },

  error (err) {
    return {
      body: { code: 1, message: err ? err.message : 'unknown error' }
    }
  },

  configHttp: {
    method: 'get',
    path: '/api'
  }
}
