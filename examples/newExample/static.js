const path = require('path')

const Fn = {
  main: function (event) {
    return { file: path.join(__dirname, 'static', event.params[0]) }
  },

  events: {
    http: {
      method: 'get',
      path: '/static/*'
    }
  }
}

module.exports = Fn
