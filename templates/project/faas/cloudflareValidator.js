module.exports = {
  configHttp: {
    method: 'get',
    path: '/validator'
  },

  configCloudflare: {
    worker: 'fly-test'
  },

  main ({ query }, { fly }) {
    try {
      fly.validate(query.name, 'string', 'name is required')
    } catch (err) {
      return { body: err.message }
    }

    return {
      body: {
        valid: true
      }
    }
  }
}
