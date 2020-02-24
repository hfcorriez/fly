class BaseApi {
  async beforeHttp (event) {
    event.uuid = event.headers['x-fly-uuid']
    return event
  }
  async main (event) {
    throw new Error('must override by child method')
  }
  async afterHttp (event) {
    return {
      status: 200,
      body: {
        data: event,
        code: 0
      }
    }
  }
  async catchHttp (error, ctx) {
    ctx.error(error)
    return {
      status: 200,
      body: {
        data: error.message,
        code: 1
      }
    }
  }
}

module.exports = BaseApi
