#!/usr/bin/env node

const program = require('commander')
const yaml = require('js-yaml')
const Table = require('cli-table2')
const fs = require('fs-extra')
const path = require('path')
const depcheck = require('depcheck2')
const querystring = require('querystring')
const childProcess = require('child_process')
const PM = require('../lib/pm')
const debug = require('debug')('fly/app/bin')

const FLY = require('../lib/fly')
const utils = require('../lib/utils')
const Errors = require('../lib/errors')
const Service = require(`../`)

const ROOT_DIR = path.join(__dirname, '/..')
const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

process.env.DEBUG_FD = 1

const pm = new PM({
  name: 'fly:app',
  path: __filename,
  root: path.join(__dirname, '../')
})

async function list (type) {
  const fly = new FLY()
  let table = new Table({
    head: ['Function', 'Events', 'File'],
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
  })

  let functions = fly.list(typeof type === 'string' ? type : null)

  Object.keys(functions).forEach(key => {
    let fnConfig = functions[key]

    table.push([
      fnConfig.name,
      fnConfig.events ? Object.keys(fnConfig.events).join(', ') : '@',
      fnConfig.file.replace(fly.runtime.dir + '/', '')
    ])
  })

  console.log(table.toString())
}

/**
 * Show configs
 */
async function show (name) {
  const fly = new FLY()

  let func = fly.get(name)

  if (!func) {
    console.error(`function "${name}" is not exists.`)
    return
  }

  console.log(yaml.safeDump({ [func.name]: func }, { skipInvalid: true }))
}

/**
 * Check dep or install dep
 *
 * @param type
 */
async function dep (type) {
  const runtime = FLY.getRuntime()

  try {
    let result = await new Promise(function (resolve, reject) {
      depcheck(runtime.dir, {}, (unused) => {
        resolve(unused)
      })
    })

    let missingPackages = []

    if (type === 'user') {
      if (Object.keys(result.missing).length) {
        console.log(`user used packages: ${Object.keys(result.missing).join(', ')}.`)
      } else {
        console.log('user has not use any packages.')
      }
    } else {
      Object.keys(result.missing).forEach(function (name) {
        if (!fs.existsSync(path.join(ROOT_DIR, `node_modules/${name}`))) missingPackages.push(name)
      })

      console.log((missingPackages.length ? `${missingPackages.length} packages need to install: ${missingPackages.join(', ')}.` : 'no missing packages.'))
    }

    if (missingPackages.length) {
      if (type === 'check') {
        console.log('\nrun "fly dep install" to install.')
      } else if (type === 'install') {
        console.log(`ready to install ${missingPackages.length} packages.`)

        await new Promise(function (resolve, reject) {
          let child = childProcess.spawn('npm', ['i', '--save'].concat(missingPackages), {
            cwd: config.runtime.dir,
            env: process.env,
            stdio: 'inherit'
          })

          child.on('close', (code) => {
            code ? reject(code) : resolve()
          })
        })
      }
    }
  } catch (err) {
    console.log(err)
  }
}


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
  .command('call <function>')
  .option('-d, --data <event>', 'Event data')
  .option('-t, --type <type>', 'Event type')
  .description('Call function with event data.')
  .action(wrap(call))

program
  .command('dep <check|install>')
  .description('Dep check and install.')
  .action(wrap(dep))

program
  .command('new [dir]')
  .option('-n, --name', 'Project name.')
  .description('Create new fly project.')
  .action(init)

program
  .command('list [type]')
  .description('List service functions.')
  .action(list)

program
  .command('show <function>')
  .description('Show one function.')
  .action(show)

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
