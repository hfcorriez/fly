const Table = require('cli-table2')
const cronParser = require('cron-parser')
const childProcess = require('child_process')
const path = require('path')
const dayjs = require('dayjs')
const debug = require('debug')('fly/evt/cro')
const Fly = require('../lib/fly')

module.exports = {
  configService: {
    name: 'cron',
    title: 'Cron Deamon',
    singleton: true
  },

  main (event, ctx) {
    const { hotreload } = event

    const fly = new Fly({
      hotreload
    }, ctx.fly)

    this.schedule(fly)

    const table = new Table({
      head: ['Time', 'Path'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    fly.list('cron').forEach(fn => table.push([fn.events.cron.time, fn.path]))
    console.log(table.toString())
  },

  schedule (fly) {
    let startSeconds

    setInterval(async () => {
      debug(`interval on ${new Date()}`)
      const currentSeconds = Math.ceil(Date.now() / 1000 / 60) * 60
      if (!startSeconds) startSeconds = currentSeconds
      if (startSeconds !== currentSeconds) {
        startSeconds = currentSeconds
        const event = { time: currentSeconds }

        try {
          const fns = this.findFn(event, fly)
          for (let fn of fns) {
            console.log(dayjs().format('YYYY-MM-DD HH:mm:ss'), 'EXEC', fn.file)
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
          console.error(dayjs().format('YYYY-MM-DD HH:mm:ss'), 'FAILED', err.stack)
        }
      }
    }, 1000)
  },

  findFn (event, fly) {
    return fly.list('cron').filter(fn => {
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
