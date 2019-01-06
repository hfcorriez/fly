const arg = require('arg')
const utils = require('../../lib/utils')

module.exports = {
  config: {
    args: {
      '--id': String,
      '--verbose': Boolean
    },
    alias: {
      '--verbose': '-V',
      '--id': '-i'
    },
    descriptions: {
      '--verbose': 'Show verbose',
      '--id': 'Set event id'
    }
  },

  links: {
    'commands': '../../commands'
  },

  main: async function (event, ctx) {
    let functions = ctx.list('command')
    let evt = {
      argv: event.argv,
      args: {},
      params: {},
      config: this.config
    }

    let fn = functions.find(f => {
      let result = this.match(event, f.events.command)
      if (result) {
        Object.assign(evt, result)
        return true
      }
      return false
    })

    if (!fn) {
      fn = functions.find(f => f.events.command.fallback)
      if (fn) evt.fallback = true
    }

    if (!fn) {
      console.error('no command found')
      return
    }

    let result
    try {
      result = await ctx.call(
        fn, evt,
        { eventId: evt.args['event-id'] || ctx.eventId, eventType: 'command' }
      )
    } catch (err) {
      console.error(err)
      return
    }

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

    let matched = false

    const result = { args: {}, params: {}, argv: source.argv }
    const args = arg(
      Object.assign(
        {}, this.config.args, target.args || {},
        this.config.alias ? utils.invert(this.config.alias) : {},
        target.alias ? utils.invert(target.alias) : {}
      ),
      {
        permissive: true,
        argv: source.argv
      }
    )

    const paramsNames = target._.match(/(<\S+>)|(\[\S+\])/g)

    if (paramsNames) {
      const targetCommandRegex = new RegExp('^' + target._
        .replace(/([a-zA-Z]) /g, '$1\\b ')
        .replace(/<\S+>/g, '(\\S+)')
        .replace(/ \[\S+\]/g, '(?: (\\S+))?'))

      const matchedParams = args._.join(' ').match(targetCommandRegex)
      if (matchedParams) {
        paramsNames.forEach((paramName, i) => {
          result.params[i] = result.params[paramName.substr(1, paramName.length - 2)] = matchedParams[i + 1]
        })
        matched = true
      }
    } else if (args._.join(' ').startsWith(target._)) {
      matched = true
    }

    if (matched) {
      Object.keys(args).forEach(key => {
        if (key.startsWith('--')) {
          result.args[key.substr(2)] = args[key]
        }
      })
      return result
    }

    return false
  }
}
