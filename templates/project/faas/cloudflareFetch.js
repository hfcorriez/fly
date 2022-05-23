module.exports = {
  configHttp: {
    method: 'get',
    path: '/fetch'
  },

  configCloudflare: {
    worker: 'fly-test',
    static: 'static'
  },

  async main (event, { cloudflare }) {
    const res = await cloudflare.fetch('https://www.cloudflare.com/ips-v4')
    const body = await res.text()
    return { body }
  }
}
