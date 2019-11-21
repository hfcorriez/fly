module.exports = {
  props: {
    username: {
      type: 'alphanumeric'
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
