module.exports = {
  configHttp: {
    method: 'get',
    path: '/r/:name'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  async main ({ params }) {
    return { redirect: '/?name=' + params.name }
  }
}
