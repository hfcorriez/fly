
module.exports = {
  async main (event, { fly }) {
    const fn = fly.get(event.params.fn)
    if (!fn) {
      console.error(`error: function "${event.params.fn}" not found`)
      return
    }
    console.log(fn)
  },

  configCommand: {
    _: 'show <fn>',
    descriptions: {
      _: 'Show full function info',
      '<fn>': 'Function name',
    },
  },
}
