const PM = require('../../lib/pm')
const pm = new PM({
  name: 'fly:http',
  path: process.argv[1]
})

module.exports = {
  links: {
    'events': '../events'
  },

  main: async function (event, ctx) {
    let name = process.cwd().split('/').pop()

    switch (event.params.command) {
      case 'start':
        await pm.start({
          name,
          args: ['http', 'run']
        })
        await pm.status(name)
        break;
      case 'status':
        await pm.status(name)
        break;
      case 'log':
        await pm.log(name)
        break;
      case 'stop':
        await pm.stop(name)
        await pm.status(name)
        break;
      case 'restart':
        await pm.stop(name)
        await pm.start({
          name,
          args: ['http', 'run']
        })
        await pm.status(name)
        break;
      case 'run':
        await ctx.call('events@http-server', { port: event.args.port })
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
        '--port': Number
      },
      alias: {
        '--port': '-p'
      },
      descriptions: {
        _: 'Manage http service',
        '[command]': 'start | stop | restart | status | log',
        '--port': 'Bind port'
      }
    }
  }
}
