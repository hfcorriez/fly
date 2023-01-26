const { Telegraf, session } = require('telegraf')
const fs = require('fs')
const { lcfirst, fromEntries } = require('../../lib/utils')

module.exports = {
  configService: {
    name: 'Bot deamon',
    singleton: true
  },

  async main (event, ctx) {
    const { type, service } = event
    const { fly } = ctx

    const functions = fly.find('chatbot').filter(fn => [service, '*'].includes(fn.events.chatbot.service))
    switch (type) {
      case 'telegram':
        this.runTelegram({ service, config: event, functions }, ctx)
        break
    }
  },

  runTelegram ({ service, config, functions }, { fly, data: ctxData }) {
    const telegraf = new Telegraf(config.token)

    telegraf.use(session())
    telegraf.use((ctx, next) => {
      const { update } = ctx
      const { chat, from } = parseEvent(update)
      fly.info('update', update)
      fly.info('session', ctx.session)

      if (!from) return

      const isAdmin = config.admins && String(config.admins).includes(from.id)
      // Only allow_users can talk to bot
      if (!isAdmin) {
        if (config.allow_users && !String(config.allow_users).includes(from.id)) {
          fly.warn('not auth user:', from.id, from.username)
          return
        }
        // Config allow_groups can work with bot
        if (config.allow_groups && ['group', 'supergroup'].includes(chat.type) && !String(config.allow_groups).includes(chat.id)) {
          fly.warn('not allow group:', chat.id, chat.title)
          if (config.deny_invite) {
            ctx.leaveChat()
            fly.warn('leave chat:', chat.id, chat.title)
          }
          return
        }
        // Deny private talk if needed
        if (config.deny_private && chat.type === 'private') {
          fly.warn('deny private:', from.id, from.username)
          return
        }
      }

      // Init session
      if (!ctx.session) ctx.session = { scene: null, action: null, history: {}, card: {} }

      // Set admin permission
      ctx.session.chatbotAdmin = isAdmin

      return next()
    })
    telegraf.use(async (ctx, next) => {
      const { update, session } = ctx

      // Match message to decide how to do next
      const { name, message, action, data, type, from } = matchMessage(functions, update, session, ctx)
      fly.info('match message:', name, action, data, type)

      /**
       * Support card action
       */
      if (type === 'card') {
        switch (name) {
          case 'delete':
            ctx.deleteMessage(message.message_id)
            break
          case 'freeze':
            ctx.editMessageText(message.text, {
              message_id: message.message_id,
              entities: message.entities,
              reply_markup: {}
            })
            break
        }
        return
      }

      const fn = fly.get(name)
      // Check fn exists and is chatbot fn
      if (!fn) {
        fly.info('no fn exists', name, action)
        return
      } else if (type !== 'fn' && (!fn.events.chatbot || (action && action !== '_back' && !fn[action]))) {
        fly.info('not chatbot fn:', name, action, fn)
        return
      }

      fly.info('ready to call', name, action, JSON.stringify(data))

      if (name) {
        if (!action) {
          initSession(ctx)
        }

        ctx.session.scene = name
        ctx.session.action = action || 'main'

        const event = {
          bot: ctx.botInfo,
          text: update.message && update.message.text,
          data,
          from,
          message,
          session: ctx.session || {},
          service
        }

        const context = {
          ...ctxData,
          eventType: 'chatbot',
          chatbot: {
            api: (name, data) => telegraf.telegram.callApi(name, data || {}),
            send: (reply) => sendMessage(reply, ctx),
            update: (reply) => updateMessage(reply, ctx),
            delete: (reply) => deleteMessage(reply, ctx),
            end: () => initSession(ctx)
          }
        }
        if (!action) {
          const [error, result] = await fly.call(name, event, context)
          fly.info('fn main', error, result)
        } else if (action === '_back') {
          // Back to previous state
          const card = data.card
          let historyMessage

          const cardHisotry = ctx.session.history[card]

          if (cardHisotry) {
            cardHisotry.pop()
            historyMessage = cardHisotry[cardHisotry.length - 1]
          }

          fly.info('history message:', card, historyMessage)

          if (historyMessage) {
            updateTgMessage(historyMessage, ctx)
          }
        } else if (action === '_end') {
          initSession(ctx)
        } else {
          const [error, result] = await fly.method(name, action, event, context)
          ctx.session.data = null
          fly.info('fn method', error, result)
        }
      }
      await next()
    })

    telegraf.launch()

    process.once('SIGINT', () => telegraf.stop('SIGINT'))
    process.once('SIGTERM', () => telegraf.stop('SIGTERM'))
    fly.info('chatbot launch', config.service)
  }
}

function deleteMessage (message, ctx) {
  if (!message) return false
  let messageId

  if (message && message.message_id) messageId = message.message_id
  else messageId = /^\d+$/.test(message) ? message : ctx.session.card[message]

  if (!messageId) return false
  if (message && message.end) {
    initSession(ctx)
  }

  return ctx.deleteMessage(messageId)
}

function updateMessage (reply, ctx) {
  const message = formatMessage(reply, ctx)
  const card = message.card

  // record message history for action
  if (card && ctx.session.history[card]) {
    ctx.session.history[card].push(message)
  }

  return updateTgMessage(message, ctx)
}

function updateTgMessage (message, ctx) {
  const { text, extra, card } = message
  if (card && ctx.session.card[card]) {
    extra.message_id = ctx.session.card[card]
  }
  return ctx.editMessageText(text, extra)
}

async function sendMessage (reply, ctx) {
  const message = formatMessage(reply, ctx)
  const card = message.card
  const sentMessage = await sendTGMessage(message, ctx)

  // record message history for action
  if (card && sentMessage) {
    // Init history for card
    if (!ctx.session.history[card]) ctx.session.history[card] = []

    // Record history
    ctx.session.history[card].push(message)

    // Save id map for card
    ctx.session.card[card] = sentMessage.message_id
  }

  ctx.session.lastSent = message

  return sentMessage
}

function sendTGMessage (message, ctx) {
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
    const isButtonGrid = Array.isArray(reply.buttons[0])
    const inlineKeyboard = []

    if (!isButtonGrid) {
      let buttons = reply.buttons.map(b => buildButton(b, ctx, reply)).filter(b => b)

      // extra = Markup.inlineKeyboard(buttons, reply.buttonsOptions)
      if (reply.buttonsColumns) {
        let columns = parseInt(reply.buttonsColumns)
        for (let i = 0, j = buttons.length; i < j; i += columns) {
          inlineKeyboard.push(buttons.slice(i, i + columns))
        }
      } else {
        inlineKeyboard.push(buttons)
      }
    } else {
      reply.buttons.forEach(buttonLine => {
        inlineKeyboard.push(buttonLine.map(b => buildButton(b, ctx, reply)).filter(b => b))
      })
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

  if (reply.action) {
    ctx.session.action = reply.action
    ctx.session.actions = null
  } else if (reply.actions) {
    ctx.session.actions = reply.actions
    ctx.session.action = null
  } else {
    ctx.session.action = null
    ctx.session.actions = null
  }

  if (reply.confirm) {
    extra.reply_markup = {
      inline_keyboard: [
        [{ text: 'YES', callback_data: 'YES' }, { text: 'NO', callback_data: 'NO' }]
      ]
    }
    ctx.session.confirm = reply.confirm
  }

  if (reply.entities) {
    extra.entities = reply.entities
  }

  // reply to quote message
  if (reply.reply_to) {
    extra.reply_to_message_id = reply.reply_to
  }

  if (reply.end) {
    ctx.session = {}
  }

  return { text, photo, file, type, extra, card: reply.card }
}

function buildButton (button, ctx, reply) {
  const data = new URLSearchParams({
    ...button.data,
    ...button.event,
    scene: ctx.session.scene,
    action: reply.card
  }).toString()

  if (typeof button === 'string') {
    return { text: button, callback_data: lcfirst(button) + ' ' + data }
  } else if (button.action) {
    // callback data will be "action x=1&y=2" when button has data
    return { text: button.text, callback_data: button.action + ' ' + data }
  } else if (button.url) {
    return button
  } else if (button.scene) {
    return { text: button.text, callback_data: '[s]' + button.scene + ' ' + data }
  } else if (button.fn) {
    return { text: button.text, callback_data: '[f]' + button.fn + ' ' + data }
  } else if (button.card) {
    return { text: button.text, callback_data: '[c]' + button.card + ' ' + data }
  }
  return null
}

function initSession (ctx) {
  if (!ctx.session) ctx.session = {}

  Object.assign(ctx.session, {
    scene: null,
    action: null,
    actions: null,
    confirm: null,
    lastSent: null,
    data: {},
    history: {},
    card: {}
  })
}

function matchMessage (functions, update, session = {}, ctx) {
  const { callback_query: callbackQuery, message } = update
  const { type: eventType } = parseEvent(update)
  const match = {
    message: message || (callbackQuery ? callbackQuery.message : null),
    from: message ? message.from : (callbackQuery ? callbackQuery.from : null)
  }

  if (session) {
    /**
     * Match session to process internal types
     */
    if ((session.actions || session.action) && update.message) {
      // Match action
      const action = session.action || matchAction(update.message, session.actions)
      // Remove exists actions selections
      delete session.actions

      // No action will reply directly
      if (!action) {
        ctx.reply(sendTGMessage(ctx.session.lastSent, ctx))
        return { ...match }
      }

      // Return scene and action
      return { ...match, name: session.scene, action }
    } else if (session.confirm && update.callback_query) {
      const { yes, no } = session.confirm
      delete session.confirm
      if (update.callback_query.data === 'YES') {
        return { ...match, name: session.scene, action: yes }
      } else if (update.callback_query.data === 'NO') {
        return { ...match, name: session.scene, action: no }
      } else {
        ctx.reply(sendTGMessage(ctx.session.lastSent, ctx))
        return { ...match }
      }
    }
  }

  if (eventType === 'button_click') {
    const [action, query] = callbackQuery.data.split(' ')
    const data = query ? fromEntries(new URLSearchParams(query).entries()) : {}

    if (action.startsWith('[s]')) {
      match.name = String(action.substr(3)).trim()
    } else if (action.startsWith('[f]')) {
      match.name = String(action.substr(3)).trim()
      match.type = 'fn'
    } else if (action.startsWith('[c]')) {
      match.name = String(action.substr(3)).trim()
      match.type = 'card'
    } else if (session.scene &&
      // Not action with [x]
      !/^\[[a-z]\]/.test(action)) {
      match.name = session.scene
      match.action = action
    }
    match.data = data
  }

  if (!match.name) {
    let fn = functions.find(fn => matchEntry(eventType, message, fn.events.chatbot.entry))
    if (!fn) {
      fn = functions.find(fn => fn.events.chatbot.entry === ':fallback')
    }

    if (fn) {
      match.name = fn.name
      if (callbackQuery && callbackQuery.data) {
        match.data = callbackQuery.data
      }
    }
    // Ignore duplicate entry (not useful)
    // if (match.fn && match.fn.name === session.scene && ) {
    //   match.fn = null
    // }
  }

  return match
}

function matchAction (message, actions) {
  const action = Object.keys(actions).find(action => matchEntry('message_add', message, actions[action]))
  if (!action) {
    return actions.default
  }
  return action
}

function matchEntry (type, message, entry) {
  if (!Array.isArray(entry)) entry = [entry]
  return entry.some(et => {
    if (typeof et === 'string') {
      /**
       * event type
       *
       * :message_add Add message
       */
      if (et.startsWith(':')) {
        return et.substring(1) === type
      } else if (message && message.text) {
        return et.startsWith('/') ? message.text.startsWith(et) : et === message.text
      }
      return false
    } else if (et instanceof RegExp && message) {
      /**
       * RegExp match message text
       */
      return et.test(message.text)
    } else if (typeof et === 'function' && message) {
      /**
       * Custom function
       */
      return et(message.text)
    }
  })
}

function parseEvent (update) {
  const message = update.message
  let type, chat, from

  if (update.callback_query) {
    type = 'button_click'
    chat = update.callback_query.message.chat
    from = update.callback_query.from
  } else if (update.my_chat_member) {
    if (update.my_chat_member.new_chat_member.status === 'member') {
      type = 'bot_join'
    } else if (update.my_chat_member.new_chat_member.status === 'left') {
      type = 'bot_left'
    }
    chat = update.my_chat_member.chat
    from = update.my_chat_member.from
  } else if (message && message.new_chat_member) {
    type = 'member_join'
    chat = message.chat
    from = message.from
  } else if (message && message.left_chat_member) {
    type = 'member_left'
    chat = message.chat
    from = message.from
  } else if (message && (message.new_chat_title || message.new_chat_photo || message.delete_chat_photo)) {
    type = 'channel_update'
    chat = message.chat
    from = message.from
  } else if (message && update.edited_message) {
    type = 'message_edit'
    chat = message.chat
    from = message.from
  } else if (message) {
    type = 'message_add'
    chat = message.chat
    from = message.from
  }

  return { type, chat, from }
}
