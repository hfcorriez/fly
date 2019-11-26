module.exports = {
  main (event, ctx) {
    return {
      body: 'injectjs23'
    }
  },

  configHttp: {
    path: '/injectjs'
  }
}
