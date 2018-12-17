module.exports = {
  links: {
    example: '../../test/example'
  },

  main: async function (event, ctx) {
    await ctx.call('http-server')
  },

  events: {
    command: {
      _: 'http [command]',
      args: {
      }
    }
  }
}
