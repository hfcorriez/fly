const { Telegraf, Markup, session } = require('telegraf')
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
      console.log('update', update, session)

      const { name, action, data, message } = matchMessage(functions, update, session)
      console.log('ready to call', name, action)
      if (name) {
        if (!ctx.session) ctx.session = {}
        ctx.session.scene = name

        const event = {
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
          console.log('fn main', error, result)
        } else {
          const [error, result] = await fly.method(name, `action${action}`, event, context)
          ctx.session.action = action
          ctx.session.data = null
          console.log('fn method', error, result)
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
  const { text, photo, file, extra, type } = formatMessage(reply, ctx)
  console.log('sendMessage', JSON.stringify({ text, photo }))
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
  let extra = null
  let photo = reply.photo
  let file = reply.file
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
    const buttons = reply.buttons.map(button => {
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

  if (reply.confirm) {
    extra = Markup.inlineKeyboard([{ text: 'YES', callback_data: 'YES' }, { text: 'YES', callback_data: 'NO' }])
    ctx.session.confirm = reply.confirm
  }

  if (reply.end) {
    ctx.session = {}
  }

  ctx.session.lastReply = reply
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

  const type = message && message.text ? 'text' : (callbackQuery ? 'callback' : null)
  const match = { message: message || (callbackQuery ? callbackQuery.message : null) }

  if (type === 'text') {
    match.fn = functions.find(fn => matchEntry(message, fn.events.chatbot.entry))
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
  if (!Array.isArray(entry)) entry = [entry]
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
