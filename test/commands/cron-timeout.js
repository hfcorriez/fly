module.exports = {
  async main (event) {
    let i = 0
    console.log('start')
    while (true) {
      await new Promise((resolve) => {
        console.log(i++)
        if (i >= 11) {
          console.error('timeout not work')
        }
        setTimeout(resolve, 1000)
      })
    }
  }
}

// ./bin/fly.js call test/functions/cron-timeout.js --timeout 10
