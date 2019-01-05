#!/usr/bin/env node

const Fly = require('../lib/fly')
const path = require('path')
const fly = new Fly(path.join(__dirname, 'boot'))

// console.log(fs.realpathSync(process.env._))
fly.call('command', { argv: process.argv.slice(2) })
