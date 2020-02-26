const pm2 = require('pm2')
const Table = require('cli-table2')
const path = require('path')
const moment = require('moment')
const colors = require('colors/safe')
const utils = require('./utils')
const ROOT_DIR = path.dirname(__dirname)

class PM {
  constructor (options) {
    this.options = Object.assign({
      name: 'app',
      cwd: process.cwd()
    }, options || {})
  }

  start (app, options) {
    options = options || {}

    const json = [{
      script: app.path || this.options.path,
      args: app.args,
      name: `${this.options.name}:${app.name}`,
      exec_mode: 'cluster',
      merge_logs: true,
      cwd: app.cwd || this.options.cwd,
      env: Object.assign({
        NODE_PATH: path.join(this.options.cwd, 'node_modules')
      }, process.env, app.env || {}),
      instances: app.instance || 'max',
      max_memory_restart: (app.max_memory || '512') + 'M',
      cron_restart: app.cronRestart
    }]

    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        pm2.start(json, err => {
          if (err) return reject(err)
          return resolve(json)
        })
      })
    })
  }

  stop (name) {
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)
        const suffix = name !== 'all' ? '(?:' + name + ')' : '.*?'
        pm2.delete(`/^${this.options.name}:${suffix}$/`, _ => resolve())
      })
    })
  }

  async list (name) {
    let list

    list = await new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)
        pm2.list((err, list) => err ? reject(err) : resolve(list))
      })
    })

    const suffix = name !== 'all' ? '(?:' + name + ')' : '.*?'

    return list.filter(item => new RegExp(`^${this.options.name}:${suffix}$`).test(item.name)).map(item => {
      return {
        id: item.pm_id,
        pid: item.pid,
        port: item.pm2_env.env.PORT,
        memory: item.monit ? utils.humansize(item.monit.memory) : null,
        cpu: item.monit && item.monit.cpu >= 0 ? item.monit.cpu : null,
        uptime: moment.duration(Date.now() - item.pm2_env.pm_uptime).humanize(),
        restarts: item.pm2_env.unstable_restarts,
        env: item.pm2_env.env
      }
    })
  }

  async status (name) {
    let list

    list = await new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)
        pm2.list((err, list) => err ? reject(err) : resolve(list))
      })
    })

    const statuses = []
    const suffix = name !== 'all' ? '(?:' + name + ')' : '.*?'

    list.filter(item => new RegExp(`^${this.options.name}:${suffix}$`).test(item.name)).map(item => {
      statuses[item.name.replace(`${this.options.name}:`, '')] = item
    })

    const table = new Table({
      head: ['ID', 'PID', 'PORT', 'Instances', 'Memory', 'CPU', 'Uptime', 'Restarts'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    Object.keys(statuses).forEach(id => {
      const status = statuses[id] || {}

      table.push([
        (status.pm2_env.status === 'online' ? colors.green('◉' + ' ' + id) : colors.red('◉' + ' ' + id)),
        status.pid || '-',
        status.pm2_env.env.PORT,
        status.pm2_env.instances,
        status.monit ? utils.humansize(status.monit.memory) : '-',
        status.monit && status.monit.cpu >= 0 ? status.monit.cpu + '%' : '-',
        status.pm2_env ? (moment.duration(Date.now() - status.pm2_env.pm_uptime).humanize()) : '-',
        status.pm2_env.unstable_restarts
      ])
    })

    console.log(table.toString())
  }

  /**
   * Restart daemons
   *
   * @param name
   */
  restart (name) {
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        const suffix = name !== 'all' ? '(?:' + name + ')' : '.*?'
        pm2.restart(`/^${this.options.name}:${suffix}$/`, err => err ? reject(err) : resolve())
      })
    })
  }

  /**
   * Restart daemons
   *
   * @param name
   */
  reload (name) {
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return reject(err)

        const suffix = name !== 'all' ? '(?:' + name + ')' : '.*?'
        pm2.reload(`/^${this.options.name}:${suffix}$/`, err => err ? reject(err) : resolve())
      })
    })
  }

  /**
   * Show logs
   *
   * @param event
   */
  async log (name) {
    const pm2Bin = path.join(ROOT_DIR, './node_modules/.bin/pm2')
    const suffix = name !== 'all' ? '(?:' + name + ')' : '.*?'
    const child = require('child_process').spawn(pm2Bin, ['logs', `/^${this.options.name}:${suffix}/`], {
      env: process.env,
      stdio: 'inherit'
    })

    await new Promise((resolve) => child.on('close', resolve))

    process.exit()
  }
}

module.exports = PM
