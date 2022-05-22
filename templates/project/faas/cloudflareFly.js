module.exports = {
  configHttp: {
    method: 'get',
    path: '/fly'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main (_, { '@lib/utils': utils, cloudflareLib, set }) {
    set('name', 'fly-test')

    return {
      body: {
        padding: utils.padding('Pading this left'),
        call: cloudflareLib({ from: 'fly-test' })
      }
    }
  }
}
