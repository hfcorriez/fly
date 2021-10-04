const { Telegraf, session } = require('telegraf')
const fs = require('fs')

module.exports = {
  configService: {
    name: 'Bot deamon',
    singleton: true
  },

  async main (event, ctx) {
    const { type, config, name } = event
    const { fly } = ctx

    const functions = fly.find('chatbot').filter(fn => fn.events.chatbot.name === name)
    switch (type) {
      case 'telegram':
        this.runTelegram({ name, config, functions }, ctx)
        break
    }
  },

  runTelegram ({ name, config, functions }, { fly }) {
    const chatbot = new Telegraf(config.token)

    chatbot.use(session())
    chatbot.use(async (ctx, next) => {
      const { update, session } = ctx
      const { name, action, data, message } = matchMessage(functions, update, session)
      fly.info('update', message, session)
      fly.info('ready to call', name, action)
      if (name) {
        if (!ctx.session) ctx.session = {}
        ctx.session.scene = name

        const event = {
          bot: ctx.botInfo,
          text: update.message && update.message.text,
          data,
          message,
          session: ctx.session || {}
        }

        const context = {
          eventType: 'chatbot',
          chatbot: {
            send: (message) => sendMessage(message, ctx),
            update: (message) => updateMessage(message, ctx),
            delete: (message) => deleteMessage(message, ctx)
          }
        }
        if (!action) {
          const [error, result] = await fly.call(name, event, context)
          fly.info('fn main', error, result)
        } else if (action === '_back') {
          updateMessage(ctx.session.lastReply, ctx)
        } else {
          const [error, result] = await fly.method(name, `action${action}`, event, context)
          ctx.session.action = action
          ctx.session.data = null
          fly.info('fn method', error, result)
        }
      }
      await next()
    })

    chatbot.launch()

    process.once('SIGINT', () => chatbot.stop('SIGINT'))
    process.once('SIGTERM', () => chatbot.stop('SIGTERM'))
    fly.info('chatbot launch', name)
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
  ctx.session.lastReply = reply

  const message = formatMessage(reply, ctx)
  const { text, photo, file, extra, type } = message

  switch (type) {
    case 'photo':
      return ctx.replyWithPhoto(photo, extra)
    case 'file':
      return ctx.replyWithDocument(file, extra)
    default:
      return ctx.reply(text, extra)
  }
}

function formatMessage (reply, ctx) {
  if (typeof reply === 'string') reply = { text: reply }

  let text = reply.text
  let photo = reply.photo
  let file = reply.file
  let type
  let extra = {}

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
  } else if (file) {
    type = 'file'
    if (typeof file === 'string') {
      if (file.startsWith('/') && fs.existsSync(file)) {
        file = { source: file }
      } else if (photo.startsWith('http')) {
        file = { url: file }
      } else {
        type = null
      }
    }
  }

  if (reply.buttons) {
    let buttons = reply.buttons.map(button => {
      if (typeof button === 'string') {
        return { text: button, callback_data: button }
      } else if (button.action) {
        // callback data will be "action x=1&y=2" when button has data
        return { text: button.text, callback_data: button.action + (button.data ? ' ' + new URLSearchParams(button.data) : '') }
      } else if (button.url) {
        return button
      }
      return null
    }).filter(b => b)

    const inlineKeyboard = []
    // extra = Markup.inlineKeyboard(buttons, reply.buttonsOptions)
    if (reply.buttonsOptions && reply.buttonsOptions.columns) {
      let columns = reply.buttonsOptions.columns
      for (let i = 0, j = buttons.length; i < j; i += columns) {
        inlineKeyboard.push(buttons.slice(i, i + columns))
      }
    } else {
      inlineKeyboard.push(buttons)
    }

    extra.reply_markup = { inline_keyboard: inlineKeyboard }
  }

  if (reply.markdown) {
    text = reply.markdown
    extra.parse_mode = 'MarkdownV2'
  }

  if (reply.session && typeof reply.session === 'object') {
    for (let key in reply.session) {
      ctx.session[key] = reply.session[key]
    }
  }

  if (reply.actions) {
    ctx.session.actions = reply.actions
  }

  if (reply.confirm) {
    extra.reply_markup = {
      inline_keyboard: [
        [{ text: 'YES', callback_data: 'YES' }, { text: 'NO', callback_data: 'NO' }]
      ]
    }
    ctx.session.confirm = reply.confirm
  }

  if (reply.end) {
    ctx.session = {}
  }

  return { text, photo, file, type, extra }
}

function matchMessage (functions, update, session = {}, ctx) {
  if (session) {
    if (session.actions && update.message) {
      const action = matchAction(update.message, session.actions)
      delete session.actions

      // No action will reply
      if (!action) {
        ctx.reply(sendMessage(ctx.session.lastReply, ctx))
        return {}
      }

      return { name: session.scene, action }
    } else if (session.confirm && update.callback_query) {
      const { yes, no } = session.confirm
      delete session.confirm
      if (update.callback_query.data === 'YES') {
        return { name: session.scene, action: yes }
      } else if (update.callback_query.data === 'NO') {
        return { name: session.scene, action: no }
      } else {
        ctx.reply(sendMessage(ctx.session.lastReply, ctx))
        return {}
      }
    }
  }

  const { callback_query: callbackQuery, message } = update
  const eventType = checkEventType(message)
  const match = { message: message || (callbackQuery ? callbackQuery.message : null) }

  if (eventType === 'button_click') {
    if (session.scene) {
      match.name = session.scene
      const [action, query] = callbackQuery.data.split(' ')
      match.action = action
      if (query) {
        match.data = Object.fromEntries(new URLSearchParams(query).entries())
      }
    }
  } else {
    match.fn = functions.find(fn => matchEntry(eventType, message, fn.events.chatbot.entry))
    // Ignore duplicate entry (not useful)
    // if (match.fn && match.fn.name === session.scene && ) {
    //   match.fn = null
    // }
  }

  if (match.fn) match.name = match.fn.name
  return match
}

function matchAction (reply, actions) {
  return Object.keys(actions).find(action => matchEntry(reply, actions[action]))
}

function matchEntry (type, message, entry) {
  if (!Array.isArray(entry)) entry = [entry]
  return entry.some(et => {
    if (typeof et === 'string') {
      if (et.startsWith(':')) {
        return et.substring(1) === type
      } else if (message.text) {
        return et.startsWith('/') ? message.text.startsWith(et) : et === message.text
      }
      return false
    } else if (et instanceof RegExp) {
      return et.test(message.text)
    } else if (typeof et === 'function') {
      return et(message.text)
    }
  })
}

function checkEventType (message) {
  if (message.callback_query) return 'button_click'
  else if (message.new_chat_member) return 'member_join'
  else if (message.left_chat_member) return 'member_left'
  else if (message.new_chat_title || message.new_chat_photo || message.delete_chat_photo) return 'channel_update'
  else return 'message_add'
}
