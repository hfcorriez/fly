const Table = require('cli-table3')

module.exports = {
  main (event, { fly }) {
    const { filter } = event.params
    const { system } = event.args
    const functions = fly.find()
    const table = new Table({
      head: ['Name', 'Props', 'Events', 'File'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    console.log('system', system)

    functions.forEach(fn => {
      if (!system && fn.prefix === '$') return
      if (filter) {
        const fullStr = [fn.namem, Object.keys(fn.events).join(','), fn.path].join('')
        if (!fullStr.includes(filter)) return
      }
      table.push([fn.name, Object.keys(fn.props || {}).join(','), Object.keys(fn.events).join(',') || '-', fn.path])
    })

    console.log(table.toString())
  },

  configCommand: {
    _: 'list [filter]',
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
