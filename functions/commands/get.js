
module.exports = {
  async main (event, { get }) {
    const fn = get(event.params.fn)
    if (!fn) {
      console.error(`error: function "${event.params.fn}" not found`)
      return
    }
    console.log(JSON.stringify({
      name: fn.name,
      prefix: fn.prefix,
      file: fn.file,
      path: fn.path,
      events: fn.events
    }, null, 4))
  },

  configCommand: {
    _: 'get <fn>',
    descriptions: {
      _: 'Get function info',
      '<fn>': 'Function name'
    }
  }
}
