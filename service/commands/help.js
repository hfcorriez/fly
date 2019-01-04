const path = require('path')
const fs = require('fs')
const utils = require('../../lib/utils')
const Fly = require('../../lib/fly')
const ROOT_DIR = path.join(__dirname, '../..')

module.exports = {
  config: {
  },

  main: async function (event, ctx) {
    const currentDir = process.cwd()
    console.log('Usage:\n')
    console.log('  fly <command> [--options]\n')

    if (ROOT_DIR !== currentDir && !event.args.system && fs.existsSync(path.join(currentDir, 'fly.yml'))) {
      const fly = new Fly()
      console.log('Commands:\n')
      this.outputCommands(fly.list('command'))
    } else {
      console.log('System Commands:\n')
      this.outputCommands(ctx.list('command'))

      if (event.config && event.config.args) {
        console.log('Global options:\n')
        this.outputCommand(event.config)
        console.log('')
      }
    }
  },

  outputCommands: function (functions) {
    functions.map(fn => this.outputCommand(fn.events.command))
    if (!functions.length) {
      console.log('  <NO COMMANDS>')
    }
    console.log('')
  },

  outputCommand: function (command) {
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
