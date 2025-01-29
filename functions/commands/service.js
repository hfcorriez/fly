const Table = require('cli-table3')
const colors = require('colors/safe')
const PM = require('../../lib/pm')

module.exports = {
  async main (_, { fly }) {
    const table = new Table({
      head: ['Name', 'Function', 'Title', 'Status'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    })

    await Promise.all(Object.keys(fly.service || {}).map(async (name) => {
      const config = fly.service[name]
      const list = await new PM({
        name: fly.project.name,
        path: process.argv[1],
      }).list(name)
      table.push([name, config.fn, config.name, list.length ? colors.green('running') : colors.red('stopped')])
    }))

    console.log(table.toString())
  },

  configCommand: {
    _: 'service',
    descriptions: {
      _: 'List services',
    },
  },
}
