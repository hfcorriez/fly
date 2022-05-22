module.exports = {
  configHttp: {
    method: 'get',
    path: '/static/:path'
  },

  configCloudflare: {
    worker: 'fly-test',
    mount: 'static'
  },

  async main ({ params }, { cloudflare }) {
    return { file: 'static/' + params.path }
  }
}
