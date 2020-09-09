#!/usr/bin/env node

const colors = require('colors/safe')
const pkg = require('../package.json')
console.log(colors.green(`❏ FLY ${pkg.version}`))

const Fly = require('../lib/fly')
const debug = require('debug')

if (!process.stdin.isTTY) {
  colors.disable()
}

let argv = process.argv.slice(2)
let verbose = false

if (!process.env.DEBUG) {
  const VERBOSE_LEVELS = ['-v', '-vv', '-vvv']
  const VERBOSE_STRS = ['*:info:*,*:warn:*,*:error:*,*:fatal:*,-fly:*', '*:info:*,*:warn:*,*:error:*,*:fatal:*', '*:*:*']
  const verboseArg = process.argv.find(arg => VERBOSE_LEVELS.includes(arg))

  verbose = VERBOSE_LEVELS.indexOf(verboseArg) + 1
  argv = process.argv.slice(2).filter(i => !VERBOSE_LEVELS.includes(i))

  if (verbose) {
    debug.enable(VERBOSE_STRS[verbose - 1])
    console.log(colors.gray(`verbose mode: ${VERBOSE_STRS[verbose - 1]} (${verbose})`))
  } else {
    debug.enable('*:warn:*,*:error:*,*:fatal:*')
  }
}

const fly = new Fly()
fly.call('$command', { argv, verbose })
