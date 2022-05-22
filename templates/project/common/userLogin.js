module.exports = {
  props: {
    username: {
      type: 'alphanumeric',
      required: true
    }
  },

  main ({ username, password }, { fly, login }) {
    fly.info('someone call login for:', username)
    return {
      username,
      password,
      status: 1,
      context: { login }
    }
  }
}
