const path = require('path')

const Fn = {
  main: function (event) {
    return { file: path.join(__dirname, 'static', event.params.path) }
  },

  configHttp: {
    method: 'get',
    path: '/static/:path+'
  }
}

module.exports = Fn
