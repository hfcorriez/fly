module.exports = {

  main: (event) => {
    return true
  },

  afterHttp (event) {
    return {
      body: { code: 0, data: event }
    }
  },

  catchHttp (err) {
    console.log(err)
    return {
      body: { code: 1, message: err ? err.message : 'unknown error', stack: err.stack }
    }
  }

}
