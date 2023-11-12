const utils = require('../../lib/utils')

module.exports = {
  async main (event, { fly }) {
    const { name } = event
    const fn = name ? fly.get(name) : null
    console.log('Usage:\n')
    console.log(`  fly ${fn ? fn.events.command._ : '<command>'} [--options]\n`)

    if (fn) {
      console.log('Options:\n')
      this.OutputCommand(fn.events.command)
      console.log('')
    } else {
      console.log('Commands:\n')
      const fns = fly.find('command')
      fns.map(fn => this.OutputCommand(fn.events.command))
      if (!fns.length) {
        console.log('  <NO COMMANDS>')
      }
      console.log('')
    }
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
            ['Boolean'].includes(args[key].name) ? '' : args[key].name.toLowerCase(),
          ].join(' '),
          28,
        ),
        descriptions[key] || '',
      )
    })
  },

  configCommand: {
    fallback: true,
    _: 'help',
    descriptions: {
      _: 'Show help',
    },
  },
}
