module.exports = {
  configHttp: {
    method: 'get',
    path: '/test'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main (event) {
    return { body: event }
  }
}
