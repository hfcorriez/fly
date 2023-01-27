const { Telegraf, session } = require('telegraf')
const { formatMessage } = require('../../lib/chatUtils')
const { fromEntries } = require('../../lib/utils')

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
      const { name, message, action, data, type, source, photo, file, from } = await matchMessage(functions, update, session, ctx)
      fly.info('match message:', name, action, data, type, photo, file)

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
          bot: ctx.botInfo, // Bot info
          service, // Service name
          text: message && message.text,
          data, // Data from card and button
          from, // From user
          source, // Click from source
          message, // Original message
          photo, // Photos,
          file, // File,
          session: ctx.session || {}
        }

        const context = {
          ...ctxData,
          eventType: 'chatbot',
          chatbot: {
            api: (name, data) => telegraf.telegram.callApi(name, data || {}),
            send: (reply) => sendMessage(reply, ctx),
            update: (reply) => updateMessage(reply, ctx),
            delete: (reply) => deleteMessage(reply, ctx),
            freeze: (reply) => freezeMessage(reply, ctx),
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

function freezeMessage (reply, ctx) {
  const card = reply.card

  // record message history for action
  if (card && ctx.session.history[card]) {
    const message = ctx.session.history[card].pop()
    ctx.telegram.editMessageText(message.chat.id, message.message_id, null, message.text, { reply_markup: {} })
  }

  if (reply.end) {
    initSession(ctx)
  }
}

async function updateMessage (reply, ctx) {
  const message = formatMessage(reply, ctx.session)
  const card = message.card

  const sendMessage = await updateTgMessage(message, ctx)

  // record message history for action
  if (card && ctx.session.history[card]) {
    ctx.session.history[card].push(sendMessage)
  }

  if (reply.end) {
    initSession(ctx)
  }

  return sendMessage
}

function updateTgMessage (message, ctx) {
  const { text, extra, card } = message
  if (card && ctx.session.card[card]) {
    extra.message_id = ctx.session.card[card]
  }
  return ctx.editMessageText(text, extra)
}

async function sendMessage (reply, ctx) {
  const message = formatMessage(reply, ctx.session)
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

  if (reply.end) {
    initSession(ctx)
  }

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

async function matchMessage (functions, update, session = {}, ctx) {
  const { callback_query: callbackQuery, message } = update
  const { type: eventType } = parseEvent(update)
  const match = {
    message: message || (callbackQuery ? callbackQuery.message : null),
    source: callbackQuery && callbackQuery.message,
    from: message ? message.from : (callbackQuery ? callbackQuery.from : null)
  }

  if (update.message) {
    if (update.message.photo) {
      match.photo = await Promise.all(update.message.photo.map(async p => {
        return {
          fileId: p.file_id,
          fileSize: p.file_size,
          fileUrl: await ctx.telegram.getFileLink(p.file_id),
          width: p.width,
          height: p.height
        }
      }))
    } else if (update.message.document) {
      const doc = update.message.document
      match.file = {
        fileId: doc.file_id,
        fileSize: doc.file_size,
        fileUrl: await ctx.telegram.getFileLink(doc.file_id),
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        thumb: doc.thumb
      }
    }
  }

  /**
   * Math function first if match entry
   */
  let fn = functions.find(fn => matchEntry(eventType, message, fn.events.chatbot.entry))
  if (fn) {
    match.name = fn.name
    if (callbackQuery && callbackQuery.data) {
      match.data = callbackQuery.data
    }
    return match
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

  /**
   * Handle button click
   */
  if (eventType === 'button') {
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
    } else if (!/^\[[a-z]\]/.test(action) && (data.scene || session.scene)) {
      match.name = data.scene || session.scene
      match.action = action
    }
    match.data = data
  }

  // Fallback
  if (!match.name) {
    fn = functions.find(fn => fn.events.chatbot.entry === `:${eventType}`)
    if (!fn) fn = functions.find(fn => fn.events.chatbot.entry === ':fallback')
    if (fn) {
      match.name = fn.name
      if (callbackQuery && callbackQuery.data) {
        match.data = callbackQuery.data
      }
    }
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
    if (typeof et === 'string' && message && message.text) {
      /**
       * event type
       *
       * :message_add Add message
       */
      return et.startsWith('/') ? message.text.startsWith(et) : et === message.text
    } else if (et instanceof RegExp && message && message.text) {
      /**
       * RegExp match message text
       */
      return et.test(message.text)
    } else if (typeof et === 'function' && message) {
      /**
       * Custom function
       */
      return et(message)
    }
  })
}

function parseEvent (update) {
  const message = update.message
  let type, chat, from

  if (update.callback_query) {
    type = 'button'
    chat = update.callback_query.message.chat
    from = update.callback_query.from
  } else if (update.my_chat_member) {
    if (update.my_chat_member.new_chat_member.status) {
      type = 'bot'
    }
    chat = update.my_chat_member.chat
    from = update.my_chat_member.from
  } else if (message && (message.new_chat_member || message.left_chat_member)) {
    type = 'member'
    chat = message.chat
    from = message.from
  } else if (message && (message.new_chat_title || message.new_chat_photo || message.delete_chat_photo)) {
    type = 'channel'
    chat = message.chat
    from = message.from
  } else if (message && message.photo) {
    type = 'photo'
    chat = message.chat
    from = message.from
  } else if (message && message.document) {
    type = 'file'
    chat = message.chat
    from = message.from
  } else if (message && update.edited_message) {
    type = 'message'
    chat = message.chat
    from = message.from
  }

  return { type, chat, from }
}
