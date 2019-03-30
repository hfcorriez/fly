const cronParser = require('cron-parser')
const childProcess = require('child_process')
const Fly = require('../lib/fly')
const debug = require('debug')('fly/evt/cro')

module.exports = {
  extends: '../base/server',

  config: {
    command: 'cron',
    name: 'CRON'
  },

  init () {
    this.fly = new Fly()
  },

  run () {
    this.schedule()
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
            const subprocess = childProcess.spawn(process.argv[0], [process.argv[1], 'call', fn.file], {
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
      const interval = cronParser.parseExpression(cron, { currentDate: new Date(event.time * 1000) })
      const currentTime = interval.next()._date.startOf('minute').unix() - 60
      return event.time === currentTime
    })
  }

}
