module.exports = {
  links: {
    app: process.cwd()
  },

  main: async function (event, ctx) {
    let fn = ctx.get(event.params[0])
    console.log(JSON.stringify(fn, null, 4))
  },

  events: {
    command: {
      _: 'show <fn>',
      descriptions: {
        _: 'Show function info',
      }
    }
  }
}
