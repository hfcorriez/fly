module.exports = {
  configHttp: {
    method: 'get',
    path: '/kv/:name'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  async main ({ params }, { cloudflare }) {
    return { body: '▶ KV TEST NAME: ' + (cloudflare.TEST ? await cloudflare.TEST.get(params.name) : 'undefined') }
  }
}
