const Table = require('cli-table2')
const Fly = require('../../lib/fly')

module.exports = {
  main: async function (event, ctx) {
    let fly = new Fly()
    let functions = fly.list(event.args.type)
    if (event.args.all) {
      functions = functions.concat(ctx.list(event.args.type))
    }

    let table = new Table({
      head: ['Name', 'Events', 'File'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    functions.forEach(fn => {
      table.push([fn.name, Object.keys(fn.events).join(',') || '-', fn.path])
    })

    console.log(table.toString())
  },
  events: {
    command: {
      _: 'list',
      args: {
        '--type': String,
        '--all': Boolean
      },
      descriptions: {
        _: 'List functions',
        '--type': 'List with type',
        '--all': 'List all commands'
      }
    }
  }
}
