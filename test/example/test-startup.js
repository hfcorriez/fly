module.exports = {
  main: function (event) {
    console.log('startup', event)
  },

  events: {
    startup: true
  }
}
