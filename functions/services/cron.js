const Table = require('cli-table2')
const cronParser = require('cron-parser')
const dayjs = require('dayjs')

module.exports = {
  configService: {
    name: 'cron',
    title: 'Cron Deamon',
    singleton: true
  },

  main (event, { fly }) {
    this.schedule(fly)

    const table = new Table({
      head: ['Time', 'Path'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    fly.list('cron').forEach(fn => table.push([fn.events.cron.time, fn.path]))
    console.log(table.toString())
    return { $command: { wait: true } }
  },

  schedule (fly) {
    let startSeconds

    setInterval(async () => {
      fly.info(`interval on ${new Date()}`)
      const currentSeconds = Math.ceil(Date.now() / 1000 / 60) * 60
      if (!startSeconds) startSeconds = currentSeconds
      if (startSeconds !== currentSeconds) {
        startSeconds = currentSeconds
        const event = { time: currentSeconds }

        try {
          const fns = this.findFn(event, fly)
          for (let fn of fns) {
            fly.debug('cron run at', dayjs().format('YYYY-MM-DD HH:mm:ss'), 'EXEC', fn.file)
            const cronConfig = fn.events.cron
            await fly.fork({ name: fn.name, timeout: cronConfig.timeout })
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
      fly.info(fn.name, 'next execution time', interval.next().toString())
      const currentTime = interval.next()._date.startOf('minute').unix() - 60
      return event.time === currentTime
    })
  }

}
