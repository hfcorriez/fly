const { Telegraf, Markup, session } = require('telegraf')

module.exports = {
  configService: {
    name: 'Bot deamon',
    singleton: true
  },

  async main (event, ctx) {
    const { type, config, name } = event
    const { fly } = ctx

    const functions = fly.find('bot').filter(fn => fn.events.bot.name === name)
    switch (type) {
      case 'telegram':
        this.runTelegram({ name, config, functions }, ctx)
        break
    }
  },

  runTelegram ({ name, config, functions }, { fly }) {
    const bot = new Telegraf(config.token)

    bot.use(session())
    bot.use(async (ctx, next) => {
      const { update, botInfo, session } = ctx
      console.log('update', update, session)

      const { name, action, message } = matchMessage(functions, update, session)
      console.log('ready to call', name, action)
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
        if (!action) {
          [error, result] = await fly.call(name, event, context)
        } else {
          [error, result] = await fly.method(name, action, event, context)
        }

        console.log('fn result', error, result)
      }
      await next()
    })

    bot.launch()

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
    fly.info('bot launch', name)

    function deleteMessage (id, ctx) {
      return ctx.deleteMessage(id)
    }
  }
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

function sendMessage (reply, ctx) {
  if (typeof reply === 'string') reply = { text: reply }
  let text = reply.text
  let extra = null
  if (reply.buttons) {
    const buttons = []
    for (let key in reply.buttons) {
      const button = reply.buttons[key]
      buttons.push({ text: button, callback_data: key })
    }
    extra = Markup.inlineKeyboard(buttons)
  }

  if (reply.session && typeof reply.session === 'object') {
    for (let key in reply.session) {
      ctx.session[key] = reply.session[key]
    }
  }

  if (reply.actions) {
    ctx.session.actions = reply.actions
  }

  ctx.session.lastReply = reply
  return ctx.reply(text, extra)
}

function matchMessage (functions, update, session = {}, ctx) {
  if (session && session.actions && update.message) {
    const action = matchAction(update.message, session.actions)

    // No action will reply
    if (!action) {
      ctx.reply(sendMessage(ctx.session.lastReply, ctx))
      return {}
    }

    return { name: session.scene, action }
  }

  const { callback_query: callbackQuery, message } = update

  const type = message && message.text ? 'text' : (callbackQuery ? 'callback' : null)
  const match = { message: message || (callbackQuery ? callbackQuery.message : null) }

  if (type === 'text') {
    match.fn = functions.find(fn => matchEntry(message, fn.events.bot.entry))
    if (match.fn && match.fn.name === session.scene) {
      match.fn = null
    }
  } else if (type === 'callback') {
    if (session.scene) {
      match.name = session.scene
      match.action = callbackQuery.data
    }
  } else {
    console.log('unknown type')
  }

  if (match.fn) match.name = match.fn.name
  return match
}

function matchAction (message, actions) {
  return Object.keys(actions).find(action => matchEntry(message, actions[action]))
}

function matchEntry (message, entry) {
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
}
