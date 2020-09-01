const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service, app } = event.params
    await new PM({
      name: `fly:${ctx.project.name}`,
      path: process.argv[1]
    }).status(`${service}-${app}`)
  },

  configCommand: {
    _: `status [service] [app]`,
    descriptions: {
      _: `Show service status`
    }
  }
}
