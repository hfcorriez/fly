module.exports = {
  links: {
    app: process.cwd()
  },

  main: async function (event, ctx) {
    let list = ctx.list(event.args.type)

    list.forEach(fn => {
      console.log(fn.id, Object.keys(fn.events).join(',') || '-', fn.path)
    })
  },
  events: {
    command: {
      _: 'list',
      args: {
        '--type': String,
      }
    }
  }
}
