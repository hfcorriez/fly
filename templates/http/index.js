const fn = {
  main (event, { project, service, parentEvent, traces }) {
    return {
      body: {
        message: '❏ FLY is ready!'
        // event
      }
    }
  },

  configHttp: {
    path: '/'
  }
}

module.exports = fn
