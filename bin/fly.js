#!/usr/bin/env node

const Fly = require('../lib/fly')
const path = require('path')
const colors = require('colors/safe')
const pkg = require('../package.json')
console.log(colors.green(`❏ FLY ${pkg.version}`))

const fly = new Fly({
  mounts: { '@': path.join(__dirname, '../functions') }
})
fly.call('@command', { argv: process.argv.slice(2) })
