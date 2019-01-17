const path = require('path')

const Func = {
  main (event) {
    return { file: path.join(__dirname, '/index.html') }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = Func
