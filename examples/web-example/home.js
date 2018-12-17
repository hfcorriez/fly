const path = require('path')

const Fn = {
  main: function (event) {
    /* Here is your logic */
    return { file: path.join(__dirname, '/index.html') }
  },

  events: {
    http: {
      method: 'get',
      path: '/'
    }
  }
}

module.exports = Fn
