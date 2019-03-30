module.exports = {
  main (event) {
    console.log('cron', event)
    require('fs').writeFileSync(__dirname + '/test.txt', new Date().getTime())
  },

  configCron: {
    time: '* * * * *'
  }
}
