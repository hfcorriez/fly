const PM = require('../pm')
const pm = new PM({
  name: 'fly:http',
  path: process.argv[1]
})

module.exports = {
  links: {
    example: '../../test/example'
  },

  main: async function (event, ctx) {
    switch (event.params.command) {
      case 'start':
        await pm.start({
          name: 'example',
          args: ['http', 'run']
        })
        break;
      case 'status':
        await pm.status('example')
        break;
      case 'log':
        await pm.log('example')
        break;
      case 'stop':
        await pm.stop('example')
        await pm.status('example')
        break;
      case 'restart':
        await pm.stop('example')
        await pm.start({
          name: 'example',
          args: ['http', 'run']
        })
        break;
      case 'run':
        await ctx.call('http-server')
        return true
    }
    return false
  },

  after: function (event) {
    !event && process.exit(0)
  },

  events: {
    command: {
      _: 'http [command]',
      args: {
      }
    }
  }
}
