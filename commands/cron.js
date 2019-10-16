const Table = require('cli-table2')
const cronParser = require('cron-parser')
const childProcess = require('child_process')
const path = require('path')

const Fly = require('../lib/fly')
const debug = require('debug')('fly/evt/cro')

module.exports = {
  extends: './server',

  config: {
    command: 'cron',
    name: 'CRON',
    singleton: true
  },

  init () {
    this.fly = new Fly()
  },

  run () {
    this.schedule()

    const table = new Table({
      head: ['Time', 'Path'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    this.fly.list('cron').forEach(fn => table.push([fn.events.cron.time, fn.path]))
    console.log(table.toString())
  },

  schedule () {
    let startSeconds

    setInterval(async () => {
      debug(`interval on ${new Date()}`)
      const currentSeconds = Math.ceil(Date.now() / 1000 / 60) * 60
      if (!startSeconds) startSeconds = currentSeconds
      if (startSeconds !== currentSeconds) {
        startSeconds = currentSeconds
        const event = { time: currentSeconds }

        try {
          const fns = this.find(event)
          for (let fn of fns) {
            console.log('CRON EXEC', fn.file)
            const cronConfig = fn.events.cron
            const subprocess = childProcess.spawn(process.argv[0], [
              path.join(__dirname, '../bin/fly.js'),
              'call',
              fn.file,
              ...cronConfig.timeout ? ['--timeout', cronConfig.timeout] : []
            ], {
              env: process.env,
              cwd: process.cwd(),
              detached: true,
              stdio: 'ignore'
            })
            subprocess.unref()
          }
        } catch (err) {
          console.error('CRON FAILED', err.stack)
        }
      }
    }, 1000)
  },

  find (event) {
    return this.fly.list('cron').filter(fn => {
      const target = fn.events.cron
      const cron = target.time || target.default
      if (!cron) return false
      const interval = cronParser.parseExpression(cron, {
        currentDate: new Date(event.time * 1000),
        tz: process.env.TZ
      })
      const currentTime = interval.next()._date.startOf('minute').unix() - 60
      return event.time === currentTime
    })
  }

}
