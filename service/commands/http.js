const Table = require('cli-table2')
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
          args: ['http', 'run'].concat(event.argv)
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
          args: ['http', 'run'].concat(event.argv)
        })
        await pm.status(name)
        break;
      case 'run':
        const table = new Table({
          head: ['Method', 'Path', 'Domain', 'Fn'],
          chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
        })
        let { address, routes } = await ctx.call('events@http', { port: event.args.port })
        routes.forEach(route =>
          table.push([route.method.toUpperCase(), route.path, (route.domain || []).join(', '), route.fn]))
        console.log(table.toString())
        console.log('fly http server at ' + address)
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
