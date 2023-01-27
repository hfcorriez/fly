const { Telegraf } = require('telegraf')
const { formatMessageRaw } = require('../../../lib/chatUtils')
const clients = {}

module.exports = async ({ service, api, data }, { getServiceConfig }) => {
  const { config } = await getServiceConfig({ service })

  switch (config.type) {
    case 'telegram':
      switch (api) {
        case 'sendMessage':
        case 'sendPhoto':
        case 'sendAudio':
        case 'sendDocument':
        case 'sendVideo':
        case 'sendAnimation':
        case 'sendVoice':
        case 'editMessageText':
        case 'editMessageCaption':
        case 'editMessageMedia':
          return getTelegraf(config.token).telegram.callApi(api, formatMessageRaw(data || {}))
      }
  }

  throw new Error('unsupport api')
}

function getTelegraf (token) {
  if (!clients[token]) {
    clients[token] = new Telegraf(token)
  }
  return clients[token]
}
