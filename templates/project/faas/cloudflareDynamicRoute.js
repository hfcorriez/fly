module.exports = {
  configHttp: {
    method: 'get',
    path: '/route/:name'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main (event) {
    return { body: event }
  }
}
