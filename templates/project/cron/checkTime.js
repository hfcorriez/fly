module.exports = {
  main (event) {
    console.log('cron', event)
    require('fs').appendFileSync('/tmp/cron.txt', [new Date().toString(), JSON.stringify(event)].join(' ') + '\n')
  },

  configCron: {
    time: '* * * * *'
  }
}
