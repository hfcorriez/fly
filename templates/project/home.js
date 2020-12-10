const path = require('path')

const Func = {
  main (event, { fly }) {
    // console.log(ctx)
    fly.info('home index 2')
    return { file: path.join(__dirname, '/index.html') }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = Func
