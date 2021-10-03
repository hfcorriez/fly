const { Telegraf, Markup, session } = require('telegraf')

module.exports = {
  configService: {
    name: 'Bot deamon',
    singleton: true
  },

  async main (event, ctx) {
    const { type, config, name } = event
    const { fly } = ctx

    const flows = fly.find('bot').filter(fn => fn.events.bot.name === name)
    switch (type) {
      case 'telegram':
        this.runTelegram({ name, config, flows }, ctx)
        break
    }
  },

  runTelegram ({ name, config, flows }, { fly }) {
    const bot = new Telegraf(config.token)

    bot.use(session())
    bot.use(async (ctx, next) => {
      const { update, botInfo } = ctx
      console.log('update', update, ctx.session)
      const { name, step } = matchMessage(update, ctx.session)
      console.log('ready to call', name, step)
      if (name) {
        if (!ctx.session) ctx.session = {}
        ctx.session.name = name

        const event = { raw: { update, botInfo }, session: ctx.session || {} }
        const context = {
          botCtx: ctx,
          eventType: 'bot',
          send: (message) => sendMessage(message, ctx)
        }
        let error, result
        if (!step) {
          [error, result] = await fly.call(name, event, context)
        } else {
          [error, result] = await fly.method(name, step, event, context)
        }

        console.log('fn result', error, result)
      }
      await next() // runs next middleware
    })

    bot.launch()

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
    fly.info('bot launch', name)

    function sendMessage (message, ctx) {
      if (typeof message === 'string') message = { text: message }
      let text = message.text
      let extra = null
      if (message.buttons) {
        const buttons = []
        for (let key in message.buttons) {
          const button = message.buttons[key]
          buttons.push({ text: button, callback_data: key })
        }
        extra = Markup.inlineKeyboard(buttons)
      }

      if (message.session && typeof message.session === 'object') {
        for (let key in message.session) {
          ctx.session[key] = message.session[key]
        }
      }
      ctx.reply(text, extra)
    }

    function matchMessage (update, session = {}) {
      const { callback_query: callbackQuery, message } = update
      const match = {}

      if (!session.name) {
        if (message && message.text) {
          match.fn = flows.find(fn => fn.events.bot.entry === message.text)
        }
      } else {
        if (callbackQuery && callbackQuery.data) {
          match.name = session.name
          match.step = callbackQuery.data
        }
      }

      if (match.fn) match.name = match.fn.name
      return match
    }
  }
}
