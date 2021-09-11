const path = require('path')

const Func = {
  main (event, { fly }) {
    // console.log(ctx)
    fly.info('log: home index')
    fly.error('log: home error')
    return { file: path.join(__dirname, '/index.html') }
  },

  catchHttp (err) {
    return { body: { code: 1, message: err.stack } }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = Func
