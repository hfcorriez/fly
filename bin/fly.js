#!/usr/bin/env node

const colors = require('colors/safe')
const debug = require('debug')
const { execSync } = require('child_process')
const cluster = require('cluster')

const pkg = require('../package.json')
const Fly = require('../lib/fly')

console.log(colors.green(`▶ FLY ${pkg.version}`))
console.log(colors.gray('> ' + Object.keys(process.versions).map(key => `${key}(${process.versions[key]})`).join(' | ')))

// Call compile force to avoid load functions in memory
if (process.stdin.isTTY) {
  execSync(`DEBUG=no ${process.argv[0]} ${__filename} compile`)
}

/**
 * Run compile with another process to avoid fly runtime waste boostrap memory
 */
if (process.argv.includes('compile')) {
  ;(async () => {
    const fly = new Fly({ ignoreCache: true })
    await fly.bootstrap()
    console.log('compile ok:', fly.loader.cache.path())
    process.exit()
  })()
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
  verbose = process.argv.includes('-v')
  if (verbose) {
    argv = process.argv.slice(2).filter(i => i !== '-v')
  }
  let verbosePattern = null

  if (verbose) {
    verbosePattern = '*:*\\|'
  } else if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    verbosePattern = '*:*\\|,-*▶*:debug*,-*▶*:info*,-*\\$*:debug*'
  } else {
    verbosePattern = '*:error*\\|,*:warn*\\|,*:info*\\|,-*▶*:*,-*\\$*:*'
  }
  console.log(colors.gray(`(verbose mode: ${verbosePattern})`))
  debug.enable(verbosePattern)
}

const clusterCount = process.env.CLUSTER === 'max' ? require('os').cpus().length : parseInt(process.env.CLUSTER || '1', 10)

if (cluster.isMaster && clusterCount > 1) {
  // Fork workers.
  for (let i = 0; i < clusterCount; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`)
    cluster.fork()
  })
} else {
  ;(async () => {
    const fly = new Fly({ useCache: true, verbose })
    await fly.bootstrap()
    return fly.call('$command', { argv, verbose })
  })()
}
