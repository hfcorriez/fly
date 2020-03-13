const fn = {
  main (event, { project, service, originalEvent }) {
    return {
      body: {
        message: '❏ FLY is ready!',
        originalEvent
        // event
      }
    }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = fn
