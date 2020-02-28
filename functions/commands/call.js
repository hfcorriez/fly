const querystring = require('querystring')
const colors = require('colors/safe')
const path = require('path')

module.exports = {
  async main (event, { call, warn }) {
    let { context, timeout, error, verbose, data } = event.args
    data = data || (await this.getStdin())
    let name = event.params[0]
    let evt

    if (data) {
      evt = this.parseData(data)
      if (!evt) {
        warn('ERROR_EVENT', 'Event data parse failed')
        return
      }
    }

    if (context) {
      context = this.parseData(context)
      if (!context) {
        warn('ERROR_CONTEXT', 'Context data parse failed')
        return
      }
    }

    if (typeof timeout === 'number') {
      // Setup timeout
      _exitIfTimeout(timeout, () => console.error(`call timeout ${timeout}s`))
    }

    // 处理文件路径的调用
    if (name.includes('.js')) {
      name = name[0] !== '/' ? path.join(process.cwd(), name) : name
    }

    const [result, err] = await call(name, evt, { eventType: null, ...context })
    if (!err) {
      console.warn(colors.green(['SUCCESS', name, '<=', JSON.stringify(evt || null)].join(' ')))
      console.log(result ? JSON.stringify(result, null, 4) : '<EMPTY>')
      return result && result.$command
    } else {
      console.error(colors.bgRed('CALL_ERROR'), colors.red(err.message))
      if (error) {
        console.error(err)
      }
      if (verbose) console.error(err)
      process.exit(1)
    }
  },

  parseData (data) {
    let ret
    try {
      ret = JSON.parse(data)
    } catch (err) {
      if (data.includes('=')) ret = querystring.parse(data)
    }
    return ret
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
      '--context': String,
      '--timeout': Number,
      '--error': Boolean
    },
    alias: {
      '--data': '-d',
      '--context': '-c',
      '--timeout': '-t',
      '--error': '-e'
    },
    descriptions: {
      '_': 'Call function',
      '<fn>': 'Function name to call',
      '--type': 'Set event type: such as http',
      '--data': 'Event data, support JSON and URL-QUERY-ENCODED',
      '--context': 'Context data, support JSON and URL-QUERY-ENCODED',
      '--timeout': 'Execution timeout',
      '--error': 'Show full error'
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
