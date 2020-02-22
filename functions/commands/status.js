const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service } = event.params
    await new PM({
      name: `fly:${ctx.project.name}`,
      path: process.argv[1]
    }).status(service)
  },

  configCommand: {
    _: `status [service]`,
    descriptions: {
      _: `Show service status`
    }
  }
}
