const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service, app } = event.params
    const pm = new PM({
      name: `fly:${ctx.project.name}`,
      path: process.argv[1]
    })
    await pm.stop(`${service}:${app})
    await pm.status(`${service}:${app}`)
  },

  configCommand: {
    _: `stop [service] [app]`,
    descriptions: {
      _: `Stop service`
    }
  }
}
