const { Telegraf, Markup, session } = require('telegraf')
const fs = require('fs')
const { lcfirst } = require('../../lib/utils')

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

      const { name, action, data, message } = matchMessage(functions, update, session)
      console.log('ready to call', name, action)
      if (name) {
        if (!ctx.session) ctx.session = {}
        ctx.session.scene = name

        const event = {
          raw: { update, botInfo },
          text: update.message && update.message.text,
          data,
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
        if (!action) {
          const [error, result] = await fly.call(name, event, context)
          console.log('fn main', error, result)
        } else {
          const [error, result] = await fly.method(name, action, event, context)
          ctx.session.action = action
          console.log('fn method', error, result)
        }
      }
      await next()
    })

    bot.launch()

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
    fly.info('bot launch', name)
  }
}

function deleteMessage (id, ctx) {
  return ctx.deleteMessage(id)
}

function updateMessage (reply, ctx) {
  const { text, extra } = formatMessage(reply, ctx)
  return ctx.editMessageText(text, extra)
}

function sendMessage (reply, ctx) {
  const { text, photo, extra, type } = formatMessage(reply, ctx)
  console.log('sendMessage', JSON.stringify({ text, photo }))
  switch (type) {
    case 'photo':
      return ctx.replyWithPhoto(photo, extra)
    default:
      return ctx.reply(text, extra)
  }
}

function formatMessage (reply, ctx) {
  if (typeof reply === 'string') reply = { text: reply }

  let text = reply.text
  let extra = null
  let photo = reply.photo
  let type

  // Photo format
  if (photo) {
    type = 'photo'
    if (typeof photo === 'string') {
      if (photo.startsWith('/') && fs.existsSync(photo)) {
        photo = { source: photo }
      } else if (photo.startsWith('http')) {
        photo = { url: photo }
      } else {
        type = null
      }
    }
    if (text && !photo.caption) {
      photo.caption = text
    }
  }

  if (reply.buttons) {
    const buttons = reply.buttons.map(button => {
      if (typeof button === 'string') {
        return { text: button, callback_data: lcfirst(button) }
      } else if (button.action) {
        // callback data will be "action x=1&y=2" when button has data
        return { text: button.text, callback_data: button.action + (button.data ? ' ' + new URLSearchParams(button.data) : '') }
      } else if (button.url) {
        return button
      }
      return null
    }).filter(b => b)
    extra = Markup.inlineKeyboard(buttons, reply.buttonsOptions)
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
  return { text, photo, type, extra }
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
    // Ignore duplicate entry (not useful)
    // if (match.fn && match.fn.name === session.scene && ) {
    //   match.fn = null
    // }
  } else if (type === 'callback') {
    if (session.scene) {
      match.name = session.scene
      const [action, query] = callbackQuery.data.split(' ')
      match.action = action
      if (query) {
        match.data = Object.fromEntries(new URLSearchParams(query).entries())
      }
    }
  } else {
    console.log('unknown type')
  }

  if (match.fn) match.name = match.fn.name
  return match
}

function matchAction (reply, actions) {
  return Object.keys(actions).find(action => matchEntry(reply, actions[action]))
}

function matchEntry (reply, entry) {
  if (typeof entry === 'string') entry = [entry]
  return entry.some(et => {
    if (typeof et === 'string') {
      return et.startsWith('/') ? reply.text.startsWith(et) : et === reply.text
    } else if (et instanceof RegExp) {
      return et.test(reply.text)
    } else if (typeof et === 'function') {
      return et(reply.text)
    }
  })
}
