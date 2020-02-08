#!/usr/bin/env node

const Fly = require('../lib/fly')
const path = require('path')
const colors = require('colors/safe')
const debug = require('debug')
const log = debug('fly/bin')
const pkg = require('../package.json')
console.log(colors.green(`❏ FLY ${pkg.version}`))

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')
if (verbose) {
  debug.enable('fly*')
  log('verbose mode enabled')
}

const fly = new Fly({
  mounts: { '@': path.join(__dirname, '../functions') }
})

fly.call('@command', {
  argv: process.argv.slice(2),
  verbose
})
