const Table = require('cli-table3')
const cronParser = require('cron-parser')
const dayjs = require('dayjs')

module.exports = {
  configService: {
    name: 'Cron deamon',
    singleton: true
  },

  main (event, ctx) {
    this.schedule(event, ctx)

    const table = new Table({
      head: ['Time', 'Path'],
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    })

    ctx.fly.find('cron').forEach(fn => table.push([fn.events.cron.time, fn.path]))
    console.log(table.toString())
    return { $command: { wait: true } }
  },

  schedule (orgEvent, ctx) {
    let startSeconds

    setInterval(async () => {
      ctx.fly.info(`interval on ${new Date()}`)
      const currentSeconds = Math.ceil(Date.now() / 1000 / 60) * 60
      if (!startSeconds) startSeconds = currentSeconds
      if (startSeconds !== currentSeconds) {
        startSeconds = currentSeconds
        const event = { time: currentSeconds }

        try {
          const fns = this.findFn(event, ctx)
          for (let fn of fns) {
            ctx.fly.info('cron run at', dayjs().format('YYYY-MM-DD HH:mm:ss'), 'EXEC', fn.file)
            const cronConfig = fn.events.cron
            await ctx.fork({ name: fn.name, timeout: cronConfig.timeout, stdio: true, context: orgEvent.context || {} })
          }
        } catch (err) {
          console.error(dayjs().format('YYYY-MM-DD HH:mm:ss'), 'FAILED', err.stack)
        }
      }
    }, 1000)
  },

  findFn (event, ctx) {
    return ctx.fly.find('cron').filter(fn => {
      const target = fn.events.cron
      const cron = target.time || target.default
      if (!cron) return false
      const interval = cronParser.parseExpression(cron, {
        currentDate: new Date(event.time * 1000),
        tz: process.env.TZ
      })
      ctx.fly.info(fn.name, 'matched')
      const currentTime = interval.next()._date.startOf('minute').unix() - 60
      return event.time === currentTime
    })
  }

}
