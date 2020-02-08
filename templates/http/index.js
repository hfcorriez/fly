const fn = {
  main (event, { project, service, parentEvent, traces }) {
    return {
      body: {
        message: '❏ FLY is ready!',
        event,
        ctx: {
          project, service, parentEvent, traces
        }
      }
    }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = fn
