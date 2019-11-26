module.exports = {
  main (event, ctx) {
    return {
      body: 'injectjs'
    }
  },

  configHttp: {
    path: '/injectjs'
  }
}
