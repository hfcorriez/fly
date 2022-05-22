module.exports = {
  configHttp: {
    method: 'get',
    path: '/fly'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main (_, { '@lib/utils': utils, cloudflareLib }) {
    return {
      body: {
        padding: utils.padding('Pading this left'),
        call: cloudflareLib({ from: 'fly-test' })
      }
    }
  }
}
