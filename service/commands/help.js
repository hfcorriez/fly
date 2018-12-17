module.exports = {
  main: async function (event, ctx) {
    let functions = ctx.list('command')
    console.log('Usage:\n')
    console.log(' fly <command> [--options]\n')
    functions.map(fn => {
      let command = fn.events.command
      console.log(command._)

      if (command.args) {
        Object.keys(command.args).forEach(arg => {
          console.log(`  ${arg}`)
        })
      }
    })
  },

  events: {
    command: {
      fallback: true,
      _: 'help'
    }
  }
}
