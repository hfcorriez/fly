const arg = require('arg')

module.exports = {
  name: 'command',

  config: {
    args: {
      '--event-id': String
    }
  },

  main: async function (event, ctx) {
    let functions = ctx.list('command')
    let evt = {
      argv: event.argv
    }

    let fn = functions.find(f => {
      evt.args = this.match(event, f.events.command)
      return !!evt.args
    })

    if (!fn) {
      console.error('no command found')
      return
    }

    let result = await ctx.call(fn.name, evt, { eventId: evt.args['event-id'] })
    if (typeof result === 'string') {
      console.log(result)
    } else if (typeof result === 'object') {
      result.stdout && console.log(result.stdout)
      result.stderr && console.log(result.stderr)
      if (typeof result.code === 'number') process.exit(result.code)
    }
  },

  match: function (source, target) {
    if (!target._ && target.default) target._ = target.default
    if (!target._) return false

    const command = arg(Object.assign({}, this.config.args, target.args), { argv: source.argv })
    if (command._.join(" ") === target._) {
      const params = {}
      Object.keys(command).forEach(key => {
        if (key.startsWith('--')) {
          params[key.substr(2)] = command[key]
        }
      })
      return params
    }
    return false
  }
}
