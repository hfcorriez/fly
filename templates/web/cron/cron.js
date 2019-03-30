module.exports = {
  main (event) {
    console.log('cron', event)
    require('fs').appendFileSync('/tmp/cron.txt', new Date().toString() + '\n')
  },

  configCron: {
    time: '* * * * *'
  }
}
