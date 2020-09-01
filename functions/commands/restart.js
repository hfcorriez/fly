const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service, app } = event.params
    const pm = new PM({
      name: `fly:${ctx.project.name}`,
      path: process.argv[1]
    })
    await pm.restart(`${service}:${app}`)
    await pm.status(`${service}:${app}`)
  },

  configCommand: {
    _: `restart [service] [app]`,
    descriptions: {
      _: `Restart service`
    }
  }
}
