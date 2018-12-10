const pm2 = require('pm2')
const Table = require('cli-table2')
const path = require('path')
const moment = require('moment')

const EXIT_SIGNALS = ['exit', 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGABRT', 'uncaughtException', 'SIGUSR1', 'SIGUSR2']

class PM {
  constructor (options) {
    this.options = Object.assign(
      {
        name: 'app',
        cwd: process.cwd()
      },
      options || {}
    )
  }

  start (apps, options) {
    options = options || {}

    let json = apps.map(app => {
      return {
        script: app.path || this.options.path,
        args: app.args,
        name: `${this.options.name}:${app.name}`,
        exec_mode: 'cluster',
        merge_logs: true,
        cwd: app.cwd || this.options.cwd,
        env: Object.assign({
          NODE_PATH: path.join(this.options.cwd, 'node_modules')
        }, process.env),
        instances: app.cluster || 'max',
        max_memory_restart: (app.max_memory || '512') + 'M'
      }
    })

    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        pm2.start(json, err => {
          if (err) {
            console.error(`start failed`, err.stack || err)
            return reject(err)
          }

          json.forEach(item => {
            console.log(`${item.name} is online.`)
          })

          if (!options.foreground) return resolve()

          pm2.launchBus((err, bus) => {
            if (err) {
              console.error(`${err.stack}`)
              return reject(err)
            }

            console.log('Log streaming started')

            bus.on('log:out', packet => {
              if (packet.process.name.indexOf(this.options.name) !== 0) return
              console.log(`(OUT) [${packet.process.name.split(':').pop()}]`, String(packet.data).trim())
            })

            bus.on('log:err', packet => {
              if (packet.process.name.indexOf(this.options.name) !== 0) return
              console.error(`(ERR) [${packet.process.name.split(':').pop()}]`, String(packet.data).trim())
            })
          })

          EXIT_SIGNALS.forEach(signal => {
            process.on(signal, () => {
              console.log('exiting...')

              if (options.docker) {
                pm2.kill(() => {
                  console.log('already stopped.')
                  process.exit(0)
                })
              } else {
                pm2.delete(`/^${this.options.name}:.*?$/`, err => {
                  if (err) {
                    console.error(`stop failed`, err.stack || err)
                    return reject(err)
                  }

                  console.log(`stopped`)
                  resolve()
                })
              }
            })
          })
        })
      })
    })
  }

  stop (names) {
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        pm2.delete(`/^${this.options.name}:${names && names[0] !== 'all' ? '(?:' + names.join('|') + ')' : '.*?'}$/`, err => {
          if (err) {
            return reject(err)
          }

          resolve()
        })
      })
    })
  }

  async status () {
    let list

    list = await new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        pm2.list((err, list) => {
          if (err) return reject(err)

          resolve(list)
        })
      })
    })

    const statuses = []

    list.filter(item => new RegExp(`^${this.options.name}:.*$`).test(item.name)).map(item => {
      statuses[item.name.replace(`${this.options.name}:`, '')] = item
    })

    let table = new Table({
      head: ['ID', 'PID', 'Cluster', 'Memory', 'CPU', 'Uptime', 'Restarts', 'Status'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    Object.keys(statuses).forEach(id => {
      let status = statuses[id] || {}

      table.push([
        id,
        status.pid || '-',
        status.pm2_env.instances,
        status.monit ? humansize(status.monit.memory) : '-',
        status.monit && status.monit.cpu >= 0 ? status.monit.cpu + '%' : '-',
        status.pm2_env ? (moment.duration(Date.now() - status.pm2_env.pm_uptime).humanize()) : '-',
        status.pm2_env.unstable_restarts,
        status.pm2_env.status
      ])
    })

    console.log(table.toString())
  }

  /**
   * Restart daemons
   *
   * @param names
   */
  restart (names) {
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        pm2.restart(`/^${this.options.name}:${names && names[0] !== 'all' ? '(?:' + names.join('|') + ')' : '.*?'}$/`, err => {
          if (err) {
            console.error(`restart failed ${err.stack}`)
            return reject(err)
          }

          resolve()
          console.log(`${this.options.name} "${names && names.length ? names.join('|') : '*'}" restarted.`)
        })
      })
    })
  }

  /**
   * Show logs
   *
   * @param event
   */
  async log (names) {
    let pm2Bin = path.join(this.options.root, './node_modules/.bin/pm2')

    let child = require('child_process').spawn(pm2Bin, ['logs', `/^${this.options.name}:${names && names.length ? names.join('|') : '*'}/`], {
      env: process.env,
      stdio: 'inherit'
    })

    await new Promise((resolve, reject) => {
      child.on('close', resolve)
    })

    process.exit()
  }
}

module.exports = PM

const MAGS = 'KMGTPEZY'
function humansize (bytes, precision) {
  let magnitude = Math.min(Math.log(bytes) / Math.log(1024) | 0, MAGS.length - 1)
  let result = bytes / Math.pow(1024, magnitude)
  let suffix = MAGS[magnitude].trim() + 'B'
  return result.toFixed(precision) + suffix
}
