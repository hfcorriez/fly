const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service } = event.params
    const name = process.cwd().split('/').pop()
    const pm = new PM({
      name: `fly:${service}`,
      path: process.argv[1]
    })
    await pm.stop(name)
    await pm.status(name)
  },

  configCommand: {
    _: `stop [service]`,
    descriptions: {
      _: `stop service`
    }
  }
}
