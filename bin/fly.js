#!/usr/bin/env node

const Fly = require('../lib/fly')
const path = require('path')

const ROOT_DIR = path.dirname(__dirname)
const fly = new Fly(ROOT_DIR + '/service/events')

~(async () => {
  // console.log('functions', fly.list())

  //await fly.call('http-server')
  await fly.call('command', { argv: process.argv.slice(2) })
  // await fly.call('testFunction')
})()
