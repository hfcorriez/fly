const pm2 = require('pm2')
const Table = require('cli-table3')
const path = require('path')
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
      max_memory_restart: (app.maxMemory || '512') + 'M',
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
      const [, name, type] = item.name.split(':')
      return {
        id: item.pm_id,
        pid: item.pid,
        name,
        type,
        status: item.pm2_env.status,
        port: item.pm2_env.env.PORT,
        memory: item.monit ? utils.humansize(item.monit.memory) : null,
        cpu: item.monit && item.monit.cpu >= 0 ? item.monit.cpu : null,
        uptime: Math.round((Date.now() - item.pm2_env.pm_uptime) / 60000) + 'm',
        restarts: item.pm2_env.unstable_restarts,
        env: item.pm2_env.env
      }
    })
  }

  async status (name) {
    const list = await this.list(name || 'all')

    const table = new Table({
      head: ['ID', 'PID', 'PORT', 'Memory', 'CPU', 'Uptime', 'Restarts'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    list.forEach(item => {
      table.push([
        (item.status === 'online' ? colors.green('◉') : colors.red('◉')) + ` ${item.type}`,
        item.pid,
        item.port,
        item.memory,
        item.cpu,
        item.uptime,
        item.restarts
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
