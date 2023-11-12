const PM = require('../../lib/pm')

module.exports = {
  async main (event, { fly }) {
    const { service } = event.params
    const pm = new PM({
      name: fly.project.name,
      path: process.argv[1],
    })
    await pm.restart(service)
    await pm.status(service)
  },

  configCommand: {
    _: `restart [service]`,
    descriptions: {
      _: `Restart service`,
    },
  },
}
