module.exports = {
  decorator: 'cloudflareApiBase',

  configHttp: {
    method: 'get',
    path: '/validator'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  props: {
    query: {
      props: {
        name: String
      }
    }
  },

  main (event, { fly }) {
    return {
      body: {
        valid: true
      }
    }
  }
}
