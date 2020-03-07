module.exports = {
  props: {
    username: {
      type: 'alphanumeric',
      required: true
    }
  },

  main ({ username, password }, { info }) {
    info('someone call login for:', username)
    return {
      username,
      password,
      status: 1
    }
  }
}
