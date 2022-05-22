module.exports = {
  decorator: 'cloudflareApiBase',

  configHttp: {
    method: 'get',
    path: '/api'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  async main (event, { cloudflare }) {
    return { ok: true }
  }
}
