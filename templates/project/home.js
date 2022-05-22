const path = require('path')

const Func = {
  main (_, { fly }) {
    return { file: path.join(__dirname, '/static/index.html') }
  },

  catchHttp (err) {
    return { body: { code: 1, message: err.stack } }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = Func
