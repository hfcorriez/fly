module.exports = {
  configHttp: {
    method: 'get',
    path: '/'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main () {
    return { body: '▶ Hello FaaS' }
  }
}
