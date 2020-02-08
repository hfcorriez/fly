module.exports = {
  props: {
    username: {
      type: 'alphanumeric',
      required: true
    }
  },

  main ({ username, password }) {
    return {
      username,
      password,
      status: 1
    }
  }
}
