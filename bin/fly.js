#!/usr/bin/env node

const program = require('commander')
const yaml = require('js-yaml')
const path = require('path')
const PM = require('../lib/pm')
const debug = require('debug')('fly/app/bin')

const FLY = require('../lib/fly')
const utils = require('../lib/utils')
const Errors = require('../lib/errors')
const Service = require(`../`)

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

process.env.DEBUG_FD = 1

const pm = new PM({
  name: 'fly:app',
  path: __filename,
  root: path.join(__dirname, '../')
})

async function run (names, opts) {
  const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
  const REDIS_PORT = process.env.REDIS_PORT || 6379
  const PORT = process.env.PORT || 10241
  const dir = process.env.DIR || process.cwd()
  const mode = 'http'

  const service = new Service({
    dir,
    mode: mode,
    redis_host: REDIS_HOST,
    redis_port: REDIS_PORT,
    port: PORT,
    register: !opts.singleton
  })

  return service.start()
    .then(async (serviceConfig) => {
      `${utils.padding('dir:', 10)} ${serviceConfig.runtime.dir}
${utils.padding('name:', 10)} ${serviceConfig.name}
${utils.padding('version:', 10)} ${serviceConfig.version}
${utils.padding('mode:', 10)} ${mode}
${utils.padding('port:', 10)} ${PORT}
---------functions----------
${Object.keys(serviceConfig.functions).sort().map((fn, i) => utils.padding(fn, 28) + ((i + 1) % 4 === 0 ? '\n' : '')).join('')}`.split('\n').forEach(i => debug(i))

      registerShutdown(async () => service.close())
      return true
    })
    .catch(err => {
      console.error(`${err.stack}`)
      process.exit(1)
    })
}

async function start (names) {
  if (!names.length) return console.error('no names given')

  names = [].concat(
    ...names.map(name => buildConfig(name, config))
  )

  await pm.start(names)
}

async function stop (names) {
  try {
    await pm.stop(names)
  } catch (err) {
    debug(`stop failed: ${err.message}`)
  }

  console.log(`${names.join(' ')} stopped`)
}

async function restart (names) {
  if (!names.length) return console.error('no names given')

  try {
    await pm.stop(names)
  } catch (err) {
    debug(`stop failed: ${err.message}`)
  }

  names = [].concat(
    ...names.map(name => buildConfig(name, config))
  )

  await pm.start(names)
}

async function status () {
  await pm.status('app')
}

async function log (names) {
  if (!names.length) return console.error('no names given')

  await pm.log(names)
}

/**
 * Show configs
 */
async function config () {
  const service = new FLY()
  console.log(yaml.safeDump(service.config, { skipInvalid: true }))
}

/**
 * Show version
 */
function version () {
  const service = new FLY()
  console.log(`app version: ${service.version}`)
}

/**
 * Commands register
 */

program
  .command('run [names...]')
  .option('-s, --singleton', 'Run singleton without register')
  .description('Run service in foreground')
  .action(wrap(run))

program
  .command('start [names...]')
  .description('Start service')
  .action(wrap(start))

program
  .command('stop [names...]')
  .description('Stop services')
  .action(wrap(stop))

program
  .command('status')
  .description('Show service status')
  .action(wrap(status))

program
  .command('restart [names...]')
  .description('Restart services')
  .action(wrap(restart))

program
  .command('log [names...]')
  .description('Show service logs')
  .action(wrap(log))

program
  .command('config')
  .description('Show config.')
  .action(config)

program
  .command('version')
  .description('Show version.')
  .action(version)

program.parse(process.argv)
if (!program.args.length) program.help()

function wrap (fn) {
  return async function () {
    try {
      let wait = await fn.apply(null, arguments)
      if (!wait) {
        process.exit(0)
      }
    } catch (err) {
      console.log(err.stack)
      process.exit(1)
    }
  }
}

function buildConfig (name, config) {
  let configs = []

  configs.push({
    name,
    args: ['run', name],
    cluster: config.apps[name].cluster || null
  })

  return configs
}

async function retry (fn, i) {
  try {
    await fn()
  } catch (err) {
    if (i > 0) return retry(fn, --i)
    throw new Errors.RetryFailedError(`retry failed: ${err.message}`)
  }
}

function registerShutdown (fn) {
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException', err)
  })

  let stopping = false
  EXIT_SIGNALS.forEach(status => process.on(status, async () => {
    if (stopping) return
    stopping = true
    try {
      debug('stopping...')
      await retry(fn, 3)
      process.exit()
    } catch (err) {
      console.error(`stop with error: ${err.message} `)
      process.exit(1)
    }
  }))
}
