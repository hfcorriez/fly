const PM = require('../../lib/pm')

module.exports = {
  async main (event) {
    const { service } = event.params
    const name = process.cwd().split('/').pop()
    await new PM({
      name: `fly:${name}`,
      path: process.argv[1]
    }).log(service)
  },

  configCommand: {
    _: `log [service]`,
    descriptions: {
      _: `Show service log`
    }
  }
}
