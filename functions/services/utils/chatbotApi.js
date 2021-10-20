const { Telegraf } = require('telegraf')

module.exports = async ({ service, api, data }, { getServiceConfig }) => {
  const { config } = await getServiceConfig({ service })
  switch (config.type) {
    case 'telegram':
      const telegraf = new Telegraf(config.token)
      return telegraf.telegram.callApi(api, data || {})
  }
}
