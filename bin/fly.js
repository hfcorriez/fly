#!/usr/bin/env node

const colors = require('colors/safe')
const debug = require('debug')
const { execSync } = require('child_process')

const pkg = require('../package.json')
const Fly = require('../lib/fly')

console.log(colors.green(`❏ FLY ${pkg.version}`))

;(async () => {
/**
 * Run compile with another process to avoid fly runtime waste boostrap memory
 */
  if (process.argv.includes('compile')) {
    const fly = new Fly({ ignoreCache: true })
    await fly.bootstrap()
    console.log('compile ok:', fly.loader.cache.path())
    return process.exit()
  }

  /**
 * Process args and debug
 */
  let argv = process.argv.slice(2)
  let verbose = false

  if (!process.stdin.isTTY) {
    colors.disable()
  }

  if (!process.env.DEBUG) {
    verbose = process.argv.some(arg => arg === '-v')
    if (verbose) {
      argv = process.argv.slice(2).filter(i => i !== '-v')
    }
    let verbosePattern = null

    if (verbose) {
      verbosePattern = '*<*>'
    } else if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      verbosePattern = '*<*>,-*debug*<_*>'
    } else {
      verbosePattern = '*error*<*>,*warn*<*>,*info*<*>,-*<_*>,-*<\\$*>'
    }
    console.log(colors.gray(`(verbose mode: ${verbosePattern})`))
    debug.enable(verbosePattern)
  }

  // Call compile force to avoid load functions in memory
  if (process.stdin.isTTY) {
    execSync(`DEBUG=no ${process.argv[0]} ${__filename} compile`)
  }

  const fly = new Fly({ useCache: true, verbose })
  await fly.bootstrap()
  return fly.call('$command', { argv, verbose })
})()
