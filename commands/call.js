const querystring = require('querystring')
const colors = require('colors/safe')
const path = require('path')
const Fly = require('../lib/fly')

module.exports = {
  async main (event, ctx) {
    const fly = new Fly()
    const { args, params } = event

    let name = params[0]
    let eventData = args.data || (await this.getStdin())
    let evt

    if (eventData) {
      try {
        evt = JSON.parse(eventData)
      } catch (err) {
        if (eventData.includes('=')) evt = querystring.parse(eventData)
        if (!evt) {
          console.warn(colors.bgRed('ERROR_DATA'), colors.red.underline('Event data parse failed'))
          return
        }
      }
    }

    if (args.timeout && typeof args.timeout === 'number') {
      // Setup timeout
      _exitIfTimeout(args.timeout, () => console.error(`call timeout ${args.timeout}s`))
    }

    const context = {}
    if (args.type) context.eventType = args.type

    let result
    let fn

    try {
      let obj = fly

      // 处理文件路径的调用
      if (name.includes('.js')) {
        name = name[0] !== '/' ? path.join(process.cwd(), name) : name
        fly.load(name)
      }

      fn = fly.get(name)
      if (!fn) {
        fn = ctx.get(name)
        obj = ctx
      }
      if (!fn) throw new Error(`no function found: ${name}`)

      result = await obj.call(fn, evt, context)
      console.warn(colors.green(['SUCCESS', fn.name, '<=', JSON.stringify(evt || null)].join(' ')))
      console.log(result ? JSON.stringify(result, null, 4) : '<EMPTY>')
      process.exit(0)
    } catch (err) {
      console.warn(colors.bgRed('CALL_ERROR'), colors.red(err.message))
      if (args.verbose) console.error(err)
      process.exit(1)
    }
  },

  getStdin () {
    const stdin = process.stdin
    let ret = ''

    return new Promise(resolve => {
      if (stdin.isTTY) return resolve(ret)
      stdin.setEncoding('utf8')
      stdin.on('readable', () => {
        let chunk
        while ((chunk = stdin.read())) ret += chunk
      })
      stdin.on('end', () => resolve(ret))
    })
  },

  configCommand: {
    _: 'call <fn>',
    args: {
      '--type': String,
      '--data': String,
      '--timeout': Number
    },
    alias: {
      '--data': '-d',
      '--timeout': '-t'
    },
    descriptions: {
      '_': 'Call function',
      '<fn>': 'Function name',
      '--type': 'Set event type',
      '--data': 'Set event data'
    }
  }
}

function _exitIfTimeout (timeout, beforeExit) {
  let sec = 0
  tryExitNextSec()
  function tryExitNextSec () {
    sec++
    setTimeout(() => {
      if (timeout <= sec) {
        beforeExit()
        process.exit(1)
      } else {
        tryExitNextSec()
      }
    }, 1000)
  }
}
