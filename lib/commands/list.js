module.exports = {
  main: async function (event, ctx) {
    let list = ctx.list(event.args.type)

    list.map(fn => {
      console.log(fn.name, Object.keys(fn.events).join(','))
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
