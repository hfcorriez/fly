const PM = require('../../lib/pm')

module.exports = {
  async main (event, { fly }) {
    const { service } = event.params
    const pm = new PM({
      name: `fly:${fly.project.name}`,
      path: process.argv[1]
    })
    await pm.stop(service)
    await pm.status(service)
  },

  configCommand: {
    _: `stop [service]`,
    descriptions: {
      _: `Stop service`
    }
  }
}
