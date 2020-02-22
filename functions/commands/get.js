
module.exports = {
  async main (event, ctx) {
    const fn = ctx.get(event.params.fn)
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
