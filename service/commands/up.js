const Table = require('cli-table2')
const PM = require('../../lib/pm')

module.exports = {
  links: {
    'events': '../events'
  },

  main: async function (event, ctx) {
    let name = process.cwd().split('/').pop()
    let mode = event.args.api ? 'api' : 'http'

    if (event.args.foregroud) {
      const table = new Table({
        head: ['Method', 'Path', 'Domain', 'Fn'],
        chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
      })
      let { address, routes } = await ctx.call(
        'events@' + (event.args.api ? 'api' : 'http'),
        { port: event.args.port }
      )

      if (mode === 'http') {
        routes.forEach(route =>
          table.push([route.method.toUpperCase(), route.path, (route.domain || []).join(', '), route.fn]))
        console.log(table.toString())
      }

      console.log(`fly up ${mode}: ${address}`)
      return true
    }

    const pm = new PM({
      name: 'fly:' + (event.args.api ? 'api' : 'http'),
      path: process.argv[1]
    })

    switch (event.params.command) {
      case 'status':
        await pm.status(name)
        break;
      case 'log':
        await pm.log(name)
        break;
      case 'end':
      case 'stop':
        await pm.stop(name)
        await pm.status(name)
        break;
      case 'restart':
        await pm.stop(name)
        await pm.start({
          name,
          args: ['up', '-f'].concat(event.argv)
        })
        await pm.status(name)
        break;
      case 'start':
      case undefined:
        await pm.start({
          name,
          args: ['up', '-f'].concat(event.argv)
        })
        await pm.status(name)
        break;
    }
  },

  after: function (event) {
    !event && process.exit(0)
  },

  events: {
    command: {
      _: 'up [command]',
      args: {
        '--port': Number,
        '--foregroud': Boolean,
        '--api': Boolean
      },
      alias: {
        '--port': '-p',
        '--foregroud': '-f',
      },
      descriptions: {
        _: 'Manage http service',
        '[command]': 'start | stop | restart | status | log',
        '--port': 'Bind port'
      }
    }
  }
}
