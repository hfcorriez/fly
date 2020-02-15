#!/usr/bin/env node

const Fly = require('../lib/fly')
const path = require('path')
const colors = require('colors/safe')
const debug = require('debug')
const info = debug('fly:info:bin')
const pkg = require('../package.json')
console.log(colors.green(`❏ FLY ${pkg.version}`))

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')
const fullVerbose = process.argv.includes('-vv')
if (verbose) {
  debug.enable('fly:info*')
  info('verbose mode enabled')
}
if (fullVerbose) {
  debug.enable('fly:*')
}

const fly = new Fly({
  mounts: { '@': path.join(__dirname, '../functions') }
})

fly.call('@command', {
  argv: process.argv.slice(2),
  verbose
})
