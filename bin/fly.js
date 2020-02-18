#!/usr/bin/env node

const Fly = require('../lib/fly')
const path = require('path')
const colors = require('colors/safe')
const debug = require('debug')
const info = Fly.Logger('fly', 'info', 'bin')
const warn = Fly.Logger('fly', 'warn', 'bin')
const pkg = require('../package.json')
console.log(colors.green(`❏ FLY ${pkg.version}`))

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')
const fullVerbose = process.argv.includes('-vv')

debug.enable('*:warn:*,*:fatal:*')
if (verbose) {
  debug.enable('*:warn:*,*:fatal:*,*:info:*')
  info('verbose mode enabled')
}
if (fullVerbose) {
  debug.enable('*:*:*')
}

warn('hello')

const fly = new Fly({
  mounts: { '@': path.join(__dirname, '../functions') }
})

fly.call('@command', {
  argv: process.argv.slice(2),
  verbose
})
