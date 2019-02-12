const arg = require('arg')
const path = require('path')
const Fly = require('../../lib/fly')
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

  main: async function (event, ctx) {
    const dirs = ['.', path.join(__dirname, '../../commands')]
    let result
    for (let dir of dirs) {
      try {
        result = await this.callCommand(dir, event, ctx)
        break
      } catch (err) {
      }
    }

    let code = 0
    if (typeof result === 'object') {
      result.stdout && console.log(result.stdout)
      result.stderr && console.error(result.stderr)
      if (typeof result.code === 'number') code = result.code
    }
    process.exit(code)
  },

  async callCommand (dir, event, ctx) {
    const flySystem = new Fly(dir)
    let functions = flySystem.list('command')
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
      throw new Error('function not found')
    }

    let result
    try {
      await flySystem.call(
        fn.name, evt,
        { eventId: evt.args['event-id'] || ctx.eventId, eventType: 'command' }
      )
    } catch (err) {
      console.error(err)
    }
    return result
  },

  match (source, target) {
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
