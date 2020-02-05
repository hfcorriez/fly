const Table = require('cli-table2')

module.exports = {
  main (event, ctx) {
    const functions = ctx.list(event.params.type)
    const table = new Table({
      head: ['Name', 'Events', 'File'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    functions.forEach(fn => {
      table.push([fn.name, Object.keys(fn.events).join(',') || '-', fn.path])
    })

    console.log(table.toString())
  },

  configCommand: {
    _: 'list [type]',
    args: {
      '--all': Boolean
    },
    descriptions: {
      _: 'List functions',
      '--all': 'List all commands'
    }
  }
}
