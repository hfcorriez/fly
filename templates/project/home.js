const path = require('path')

const Func = {
  main (event, { fly }) {
    // console.log(ctx)
    fly.info('home index')
    fly.error('home error')
    return { file: path.join(__dirname, '/index.html') }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = Func
