const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service } = event.params
    const name = process.cwd().split('/').pop()
    await new PM({
      name: `fly:${service}`,
      path: process.argv[1]
    }).log(name)
  },

  configCommand: {
    _: `log [service]`,
    descriptions: {
      _: `log service`
    }
  }
}
