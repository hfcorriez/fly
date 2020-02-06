const arg = require('arg')
// const path = require('path')
// const fs = require('fs')
const utils = require('../../lib/utils')
// const FN_DIR = path.join(__dirname, '../../functions')

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

  async main (event, ctx) {
    // const systemFns = fs.readdirSync(FN_DIR).filter(file => file.endsWith('.js')).map(file => file.split('.').shift())
    // let dir = '.'
    // if (systemFns.includes(event.argv[0]) || !event.argv[0]) dir = FN_DIR
    let result = await this.callFn(event, ctx)
    let code = 0
    let wait = false
    if (typeof result === 'object') {
      result.stdout && console.log(result.stdout)
      result.stderr && console.error(result.stderr)
      if (typeof result.code === 'number') code = result.code
      wait = result.wait
    }
    !wait && process.exit(code)
  },

  callFn (event, ctx) {
    const functions = ctx.list('command')
    const evt = {
      argv: event.argv,
      args: {},
      params: {}
    }

    let caller = ctx.fly
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

    if (!fn) throw new Error('function not found')

    try {
      return caller.call(
        fn.name,
        evt,
        { eventId: evt.args['event-id'] || ctx.eventId, eventType: 'command' }
      )
    } catch (err) {
      console.error(err)
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
      // Support ENV
      target.args && Object.keys(target.args).forEach(key => {
        key = key.substr(2)
        const capKey = key.toUpperCase()
        if (!args[key] && process.env[capKey]) {
          args[key] = process.env[capKey]
        }
      })
      return result
    }

    return false
  }
}
