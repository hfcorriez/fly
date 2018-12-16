module.exports = {
  name: 'testCommand',
  main: async function (event, ctx) {
    await ctx.call('testFunction')
  },
  events: {
    command: {
      _: 'install dist',
      args: {
        '--help': Boolean,
        '--version': Boolean,
        '--port': Number,
        '--name, -n': String
      }
    }
  }
}
