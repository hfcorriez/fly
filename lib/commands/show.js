module.exports = {
  main: async function (event, ctx) {
    let fn = ctx.get(event.command[1])
    console.log(JSON.stringify(fn, null, 4))
  },

  events: {
    command: {
      _: 'show'
    }
  }
}
