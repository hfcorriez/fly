const PM = require('../../lib/pm')

module.exports = {
  async main (event, { fly }) {
    const { service } = event.params
    await new PM({
      name: fly.project.name,
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
