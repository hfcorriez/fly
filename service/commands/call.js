const querystring = require('querystring')
const path = require('path')

module.exports = {
  links: {
    _: process.cwd()
  },

  main: async function (event, ctx) {
    let name = event.params[0]
    let eventData = event.args.data || (await this.getStdin())
    let evt

    if (eventData) {
      try {
        evt = JSON.parse(eventData)
      } catch (err) {
        evt = querystring.parse(eventData)
        if (!evt) {
          console.error(`Event data parse failed: ${err.message}`)
        }
      }
    }

    if (event.args.type) {
      ctx.eventType = event.args.type
    }

    let result
    let fn

    try {
      fn = ctx.get(name.includes('.') ? path.resolve(name) : (name.includes('@') ? name : '_@' + name))
      if (!fn) throw new Error('no function found')

      result = await ctx.call(fn, evt, ctx)
    } catch (err) {
      console.error(err.message)
      return
    }

    console.log(`"${fn.name}" result:\n`)
    console.log(JSON.stringify(result, null, 4))
  },


  getStdin: function () {
    const stdin = process.stdin
    let ret = ''

    return new Promise(resolve => {
      if (stdin.isTTY) {
        resolve(ret)
        return
      }

      stdin.setEncoding('utf8')

      stdin.on('readable', () => {
        let chunk

        while ((chunk = stdin.read())) {
          ret += chunk
        }
      })

      stdin.on('end', () => {
        resolve(ret)
      })
    })
  },

  events: {
    command: {
      _: 'call <fn>',
      args: {
        '--type': String,
        '--data': String,
      },
      alias: {
        '--data': '-d'
      },
      descriptions: {
        '_': 'Call function',
        '<fn>': 'Function name',
        '--type': 'Set event type',
        '--data': 'Set event data'
      }
    }
  }
}
