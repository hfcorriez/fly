const PM = require('../../lib/pm')

module.exports = {
  async main (event, ctx) {
    const { service } = event.params
    const pm = new PM({
      name: `fly:${ctx.project.name}`,
      path: process.argv[1]
    })
    await pm.reload(service)
    await pm.status(service)
  },

  configCommand: {
    _: `reload [service]`,
    descriptions: {
      _: `Reload service`
    }
  }
}
