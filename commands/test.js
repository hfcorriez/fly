const colors = require('colors/safe')
const Fly = require('../lib/fly')

module.exports = {
  async main (event) {
    const fly = new Fly()
    const { args, params } = event
    const name = params[0]
    if (args.timeout && typeof args.timeout === 'number') {
      // Setup timeout
      _exitIfTimeout(args.timeout, () => console.error(`call timeout ${args.timeout}s`))
    }

    try {
      let passCount = 0
      let testCount = 0

      if (!name) {
        const functions = fly.list().filter(fn => fn.test)
        testCount = functions.length
        console.log(`◼︎ ${testCount} functions to test\n`)
        for (let fn of functions) {
          const passed = await this.runTest(fly, fn.name, functions.indexOf(fn) + 1)
          if (passed) passCount++
        }
      } else {
        testCount = 1
        console.log(`◼︎ 1 function to test\n`)
        passCount = (await this.runTest(fly, name)) ? 1 : 0
      }

      console.log()
      if (passCount === testCount) {
        console.log(colors.green.bold(`√ ${passCount}/${testCount} functions passed`))
      } else {
        console.log(colors.red(`x ${passCount}/${testCount} functions passed`))
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

  async runTest (fly, name, id) {
    id = id || 1
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
    for (let test of tests) {
      test.startTime = Date.now()

      try {
        let result
        try {
          result = await fly.call(fn, test.event, context)
        } catch (err) {
          result = err
        }

        await test.check(result)
        test.ok = true
      } catch (err) {
        test.ok = false
        test.error = err
      }

      test.endTime = Date.now()
      test.spendTime = test.endTime - test.startTime
    }

    const passedCount = (tests.filter(test => test.ok) || []).length
    const passed = passedCount === tests.length

    if (passed) {
      console.log(colors.green(`√ [${id}] +${fn.name} ${passedCount}/${tests.length} passed`))
    } else {
      console.log(colors.red(`x [${id}] +${fn.name} ${passedCount}/${tests.length} passed`))
    }
    for (let index in tests) {
      const test = tests[index]
      const id = parseInt(index) + 1
      if (test.ok) {
        console.log(colors.green(`    √ ${id}) ${test.name} (${test.spendTime}ms)`))
      } else {
        console.log(colors.red(`    x ${id}) ${test.name} "${test.error.message}" (${test.spendTime}ms)`))
      }
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
