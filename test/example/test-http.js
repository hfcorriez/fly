module.exports = {
  main: function (event) {
    console.log('http incoming', event.path)
    return {
      body: 'ok'
    }
  },

  events: {
    http: {
      path: '/'
    }
  }
}
