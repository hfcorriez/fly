const PM = require('../../lib/pm')

module.exports = {
  async main (event) {
    const { service } = event.params
    const name = process.cwd().split('/').pop()
    const pm = new PM({
      name: `fly:${name}`,
      path: process.argv[1]
    })
    await pm.stop(service)
    await pm.status(service)
  },

  configCommand: {
    _: `stop [service]`,
    descriptions: {
      _: `stop service`
    }
  }
}