const colors = require('colors/safe')
const Fly = require('../lib/fly')

module.exports = {
  async main (event, ctx) {
    const fly = new Fly()
    const { args, params } = event
    const name = params[0]
    if (args.timeout && typeof args.timeout === 'number') {
      // Setup timeout
      _exitIfTimeout(args.timeout, () => console.error(`call timeout ${args.timeout}s`))
    }

    try {
      if (!name) {
        const functions = fly.list().filter(fn => fn.test)
        let passCount = 0
        console.log(`◉ ${functions.length} functions to test`)
        for (let fn of functions) {
          const passed = await this.runTest(fly, fn.name)
          if (passed) passCount++
        }
        if (passCount === functions.length) {
          console.log(colors.bgGreen(`√ ${passCount}/${functions.length} functions passed`))
        } else {
          console.log(colors.bgRed(`x ${passCount}/${functions.length} functions passed`))
        }
      } else {
        await this.runTest(fly, name)
      }
      process.exit(0)
    } catch (err) {
      console.error(colors.bgRed('TEST_ERROR'), colors.red(err.message))
      if (args.error) {
        console.error(err)
      }
      if (args.verbose) console.error(err)
      process.exit(1)
    }
  },

  async runTest (fly, name) {
    const fn = fly.get(name)

    if (!fn) {
      throw new Error(`no function found: ${name}`)
    }

    if (!fn.test) {
      throw new Error('no test file')
    }

    const context = {}
    const testConfig = require(fn.test)
    if (!testConfig.tests) {
      throw new Error('no tests')
    }
    const tests = testConfig.tests
    console.log(`▶︎ [${fn.name}] ${tests.length} tests`)
    for (let index in tests) {
      const test = tests[index]
      test.startTime = Date.now()

      try {
        const result = await fly.call(fn, test.event, context)
        await test.result(result)
        test.ok = true
      } catch (err) {
        test.ok = false
        test.error = err
      }

      test.endTime = Date.now()
      test.spendTime = test.endTime - test.startTime

      if (test.ok) {
        console.log(colors.green(`    √ [${index}] ${test.name} (${test.spendTime}ms)`))
      } else {
        console.log(colors.red(`    x [${index}] ${test.name}: ${test.error.message} (${test.spendTime}ms)`))
      }
    }

    const passedCount = (tests.filter(test => test.ok) || []).length
    const passed = passedCount === tests.length
    if (passed) {
      console.log(colors.green(`√ [${fn.name}] ${passedCount}/${tests.length} passed`))
    } else {
      console.log(colors.red(`x [${fn.name}] ${passedCount}/${tests.length} passed`))
    }
    return passed
  },

  configCommand: {
    _: 'test [fn]',
    args: {
      '--timeout': Number,
      '--error': Boolean
    },
    alias: {
      '--error': '-e'
    },
    descriptions: {
      '_': 'Call function',
      '<fn>': 'Function name',
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
