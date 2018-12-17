module.exports = {
  main: async function (event, ctx) {
    let list = ctx.list(event.args.type)

    list.map(fn => {
      console.log(fn.id, Object.keys(fn.events).join(',') || '-', fn.path)
    }).join('\n')
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
