#!/usr/bin/env node

const colors = require('colors/safe')
const debug = require('debug')
const { execSync } = require('child_process')

const pkg = require('../package.json')
const Fly = require('../lib/fly')

console.log(colors.green(`❏ FLY ${pkg.version}`))

/**
 * Run compile with another process to avoid fly runtime waste boostrap memory
 */
if (process.argv.includes('compile')) {
  const fly = new Fly({ ignoreCache: process.argv.includes('-f') })
  console.log('compile ok:', fly.loader.cache.path())
  process.exit()
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
  const VERBOSE_LEVELS = ['-v', '-vv']
  const VERBOSE_STRS = ['<*:*>*,-<fly:*>*', '<*:*>*']
  const verboseArg = process.argv.find(arg => VERBOSE_LEVELS.includes(arg))

  verbose = VERBOSE_LEVELS.indexOf(verboseArg) + 1
  argv = process.argv.slice(2).filter(i => !VERBOSE_LEVELS.includes(i))

  if (verbose) {
    debug.enable(VERBOSE_STRS[verbose - 1])
    console.log(colors.gray(`verbose mode: ${VERBOSE_STRS[verbose - 1]} (${verbose})`))
  } else {
    debug.enable('<*:*>*error*,<*:*>*warn*')
  }
}

// Call compile force to avoid load functions in memory
execSync(`${process.argv[0]} ${__filename} compile`)

const fly = new Fly()
fly.call('$command', { argv, verbose })
