module.exports = {
  main (event, ctx) {
    return {
      body: 'injectjs16'
    }
  },

  configHttp: {
    path: '/injectjs'
  }
}
