const Table = require('cli-table3')

module.exports = {
  main (event, { fly }) {
    const functions = fly.find(event.params.type)
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
    descriptions: {
      _: 'List functions'
    }
  }
}
