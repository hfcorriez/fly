const utils = require('../../lib/utils')

module.exports = {
  async main (event, ctx) {
    console.log('Usage:\n')
    console.log('  fly <command> [--options]\n')

    console.log('Commands:\n')
    this.OutputCommands(ctx.list('command'))

    if (event.config && event.config.args) {
      console.log('Global options:\n')
      this.OutputCommand(event.config)
      console.log('')
    }
  },

  OutputCommands (functions) {
    functions.map(fn => this.OutputCommand(fn.events.command))
    if (!functions.length) {
      console.log('  <NO COMMANDS>')
    }
    console.log('')
  },

  OutputCommand (command) {
    let descriptions = command.descriptions || {}
    let alias = command.alias || {}
    let args = command.args || {}
    let commandDescriptions = {}
    Object.keys(descriptions).forEach(key => {
      if (key.startsWith('<') || key.startsWith('[')) commandDescriptions[key] = descriptions[key]
    })

    command._ && console.log(' ', utils.padding(command._, 30), descriptions._ || '')

    Object.keys(commandDescriptions).forEach(key => {
      console.log('   ', utils.padding(key, 28), commandDescriptions[key])
    })

    Object.keys(args).forEach(key => {
      console.log(
        '   ',
        utils.padding(
          [
            key + (alias[key] ? ',' + alias[key] : ''),
            ['Boolean'].includes(args[key].name) ? '' : args[key].name.toLowerCase()
          ].join(' '),
          28
        ),
        descriptions[key] || ''
      )
    })
  },

  configCommand: {
    fallback: true,
    _: 'help',
    args: {
      '--system': Boolean
    },
    alias: {
      '--system': '-s'
    },
    descriptions: {
      _: 'Show help',
      '--system': 'Show system commands'
    }
  }
}
