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
      const { name, step, message } = matchMessage(update, ctx.session)
      console.log('ready to call', name, step)
      if (name) {
        if (!ctx.session) ctx.session = {}
        ctx.session.scene = name

        const event = {
          raw: { update, botInfo },
          text: update.message && update.message.text,
          message,
          session: ctx.session || {}
        }
        const context = {
          botCtx: ctx,
          eventType: 'bot',
          bot: {
            send: (message) => sendMessage(message, ctx),
            update: (message) => updateMessage(message, ctx),
            delete: (message) => deleteMessage(message, ctx)
          }
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

    function deleteMessage (id, ctx) {
      return ctx.deleteMessage(id)
    }

    function updateMessage (message, ctx) {
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
      return ctx.editMessageText(text, extra)
    }

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
      return ctx.reply(text, extra)
    }

    function matchMessage (update, session = {}) {
      const { callback_query: callbackQuery, message } = update

      const type = message && message.text ? 'text' : (callbackQuery ? 'callback' : null)
      const match = { message: message || (callbackQuery ? callbackQuery.message : null) }

      if (type === 'text') {
        match.fn = flows.find(fn => {
          let entry = fn.events.bot.entry
          if (typeof entry === 'string') entry = [entry]

          return entry.some(et => {
            if (typeof et === 'string') {
              return et.startsWith('/') ? message.text.startsWith(et) : et === message.text
            } else if (et instanceof RegExp) {
              return et.test(message.text)
            } else if (typeof et === 'function') {
              return et(message.text)
            }
          })
        })
        if (match.fn && match.fn.name === session.scene) {
          match.fn = null
        }
      } else if (type === 'callback') {
        if (session.scene) {
          match.name = session.scene
          match.step = callbackQuery.data
        }
      } else {
        console.log('unknown type')
      }

      if (match.fn) match.name = match.fn.name
      return match
    }
  }
}
