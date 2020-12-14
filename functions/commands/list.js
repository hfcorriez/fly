const Table = require('cli-table3')

module.exports = {
  main (event, { fly }) {
    const { type } = event.params
    const { system } = event.args
    const functions = fly.find(type)
    const table = new Table({
      head: ['Name', 'Events', 'File'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    console.log('system', system)

    functions.forEach(fn => {
      if (!system && fn.prefix === '$') return
      table.push([fn.name, Object.keys(fn.events).join(',') || '-', fn.path])
    })

    console.log(table.toString())
  },

  configCommand: {
    _: 'list [type]',
    args: {
      '--system': Boolean
    },
    alias: {
      '--system': '-s'
    },
    descriptions: {
      _: 'List functions',
      '--system': 'Show system functions'
    }
  }
}
