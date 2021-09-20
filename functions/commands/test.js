const colors = require('colors/safe')

module.exports = {
  async main (event, { fly }) {
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
        // console.log('test', fly.find())
        const functions = fly.find().filter(fn => fn.testFile)
        testCount = functions.length
        console.log(colors.bold(`◼︎ test ready [${testCount}]`))
        console.log(colors.gray('  ----------------------------------------------------------------'))
        for (let fn of functions) {
          const passed = await this.runTest(fly, fn.name, functions.indexOf(fn) + 1)
          if (passed) passCount++
        }
      } else {
        testCount = 1
        console.log(`◼︎ test ready [${testCount}]`)
        console.log(colors.gray('  ----------------------------------------------------------------'))
        passCount = (await this.runTest(fly, name)) ? 1 : 0
      }

      if (passCount === testCount) {
        console.log(colors.green.bold(`✅ test passed [${passCount}/${testCount}]`))
      } else {
        console.log(colors.red.bold(`❌ test failed [${passCount}/${testCount}]`))
      }
      process.exit(0)
    } catch (err) {
      console.error(colors.bgRed('test error'), colors.red(err.message))
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

    if (!fn.testFile) {
      throw new Error('no test file')
    }

    const context = {}
    const testConfig = require(fn.testFile)
    if (!testConfig.tests) {
      throw new Error('no tests')
    }
    const tests = testConfig.tests
    for (let test of tests) {
      test.startTime = Date.now()

      try {
        let result, err
        try {
          [result, err] = await fly.call(fn, test.event, context)
        } catch (e) {
          err = e
        }

        await test.test(result, err)
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
      console.log(colors.bold(colors.green(`${id}. <${fn.name}> passed [${passedCount}/${tests.length}]`)))
    } else {
      console.log(colors.bold(colors.red(`${id}. <${fn.name}> failed [${passedCount}/${tests.length}]`)))
    }
    for (let index in tests) {
      const test = tests[index]
      const id = parseInt(index) + 1
      if (test.ok) {
        console.log(colors.green(`  √`), colors.gray(`${id}) ${test.name} (${test.spendTime}ms)`))
      } else {
        console.log(colors.red(`  x`), colors.gray(`${id}) ${test.name}`))
        console.log(test.error.stack.replace(/^/gm, '    '))
      }
    }
    console.log(colors.gray('  ----------------------------------------------------------------\n'))
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
      '_': 'Test functions',
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
