const utils = require('../../lib/utils')

module.exports = {
  links: {
    app: process.cwd()
  },

  config: {
  },

  main: async function (event, ctx) {
    let functions = ctx.list('command')
    console.log('Usage:\n')
    console.log(' fly <command> [--options]\n')
    functions.map(fn => {
      let command = fn.events.command
      let descriptions = command.descriptions || {}
      let alias = command.alias || {}
      let args = command.args || {}
      let commandDescriptions = {}
      Object.keys(descriptions).forEach(key => {
        if (key.startsWith('<') || key.startsWith('[')) commandDescriptions[key] = descriptions[key]
      })

      console.log(utils.padding(command._, 30), descriptions._ || '')

      Object.keys(commandDescriptions).forEach(key => {
        console.log(' ', utils.padding(key, 30), commandDescriptions[key])
      })

      Object.keys(args).forEach(key => {
        console.log(
          ' ',
          utils.padding(
            [
              key + (alias[key] ? ',' + alias[key] : ''),
              ['Boolean'].includes(args[key].name) ? '' : args[key].name.toLowerCase()
            ].join(' '),
            30
          ),
          descriptions[key] || ''
        )
      })

      if (command.descriptions) {

      }
    })
  },

  events: {
    command: {
      fallback: true,
      _: 'help',
      descriptions: {
        _: 'Show help'
      }
    }
  }
}
