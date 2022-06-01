const arg = require('arg')
const colors = require('colors/safe')
const { invert, parseObjArg } = require('../../lib/utils')

module.exports = {
  config: {
    args: {
      '--context': String,
      '--help': Boolean
    },
    alias: {
      '--context': '-c',
      '--help': '-h'
    },
    descriptions: {
      '--context': 'Set context',
      '--help': 'Show help'
    }
  },

  async main (event, { fly, eventId }) {
    const { argv, verbose } = event
    const functions = fly.find('command')
    const evt = {
      argv,
      args: {},
      params: {}
    }

    fly.debug('parse command:', argv.join(' '))

    let fn = functions.find(f => {
      const matched = this.match(event, f.events.command)
      if (matched) {
        fly.debug('find matched command', f.name)
        Object.assign(evt, matched)
        return true
      }
      return false
    })

    if (evt.args.help) {
      const [, err] = await fly.call('$help', { name: fn.name })
      if (err) {
        process.exit(1)
      } else {
        process.exit(0)
      }
    }

    // Lookup fallback command
    if (!fn) {
      fly.debug('lookup fallback command')
      fn = functions.find(f => f.events.command.fallback)
      if (fn) evt.fallback = true
    }

    if (!fn) throw new Error('function not found')

    evt.args.verbose = verbose

    try {
      const context = evt.args.context ? parseObjArg(evt.args.context) : null
      const [result, err] = await fly.call(fn, evt, {
        eventId: evt.args['event-id'] || eventId,
        eventType: 'command',
        ...context
      }, true)
      if (err) throw err

      let code = 0
      let wait = false

      if (result && typeof result === 'object' && !Array.isArray(result)) {
        result.stdout && console.log(result.stdout)
        result.stderr && console.error(result.stderr)
        if (typeof result.code === 'number') code = result.code
        wait = result.wait
      } else if (['string', 'number', 'boolean', 'array'].includes(typeof result)) {
        console.log(result)
      }
      if (code || !wait) {
        process.exit(code)
      }
    } catch (err) {
      if (evt.args.verbose) {
        console.error(err)
      } else {
        console.error(colors.red(`✖︎ [${err.name}] ${err.stack}`))
      }
      process.exit(err.code || 1)
    }
  },

  match (source, target) {
    if (!target._ && target.default) target._ = target.default
    if (!target._) return false

    let matched = false

    const result = { args: {}, params: {}, argv: source.argv }
    const args = arg(
      Object.assign(
        {}, this.config.args, target.args || {},
        this.config.alias ? invert(this.config.alias) : {},
        target.alias ? invert(target.alias) : {}
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
      // Support ENV
      target.args && Object.keys(target.args).forEach(key => {
        key = key.substr(2)
        const capKey = key.toUpperCase()
        if (!result.args[key] && process.env[capKey]) {
          result.args[key] = process.env[capKey]
        }
      })
      return result
    }

    return false
  }
}
