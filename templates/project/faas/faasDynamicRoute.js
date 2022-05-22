module.exports = {
  configHttp: {
    method: 'get',
    path: '/test/:name'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main (event) {
    return { body: event }
  }
}
