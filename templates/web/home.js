const path = require('path')

const Func = {
  main (event, ctx) {
    // console.log(ctx)
    return { file: path.join(__dirname, '/index.html') }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = Func
