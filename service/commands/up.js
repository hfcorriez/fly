const Table = require('cli-table2')
const PM = require('../../lib/pm')

module.exports = {
  links: {
    'events': '../events'
  },

  main: async function (event, ctx) {
    let name = process.cwd().split('/').pop()
    let mode = event.args.api ? 'api' : 'http'

    if (event.args.foreground) {
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

    let names = !event.args.all && name

    switch (event.params.command) {
      case 'list':
      case 'status':
        await pm.status(names)
        break
      case 'log':
        await pm.log(names)
        break
      case 'end':
      case 'stop':
        await pm.stop(names)
        await pm.status(names)
        break
      case 'again':
      case 'restart':
        await pm.restart(names)
        await pm.status(names)
        break
      case 'hot':
      case 'reload':
        await pm.reload(names)
        await pm.status(names)
        break
      case 'start':
      case undefined:
        await pm.start({
          name,
          args: ['up', '-f'],
          instance: event.args.instance,
          env: {
            PORT: event.args.port || 5000
          }
        })
        await pm.status(name)
        break
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
        '--foreground': Boolean,
        '--api': Boolean,
        '--instance': Number,
        '--all': Boolean
      },
      alias: {
        '--port': '-p',
        '--foreground': '-f',
        '--instance': '-i',
        '--all': '-a'
      },
      descriptions: {
        _: 'Manage http service',
        '[command]': 'start | stop | reload | restart | status | log',
        '--port': 'Bind port',
        '--api': 'Run api mode only',
        '--foreground': 'Run in foreground',
        '--instance': 'The instance number',
        '--all': 'All applications'
      }
    }
  }
}
