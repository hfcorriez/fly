const fs = require('fs')
const { lcfirst } = require('./utils')

function formatMessage (reply, session = {}) {
  if (typeof reply === 'string') reply = { text: reply }

  let text = reply.text
  let photo = reply.photo
  let file = reply.file
  let type
  let extra = {}

  if (reply.chat_id) {
    extra.chat_id = reply.chat_id
  }

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
      let buttons = reply.buttons.map(b => buildButton(b, reply, session)).filter(b => b)

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
        inlineKeyboard.push(buttonLine.map(b => buildButton(b, reply, session)).filter(b => b))
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
      session[key] = reply.session[key]
    }
  }

  if (reply.action) {
    session.action = reply.action
    session.actions = null
  } else if (reply.actions) {
    session.actions = reply.actions
    session.action = null
  } else {
    session.action = null
    session.actions = null
  }

  if (reply.confirm) {
    extra.reply_markup = {
      inline_keyboard: [
        [{ text: 'YES', callback_data: 'YES' }, { text: 'NO', callback_data: 'NO' }]
      ]
    }
    session.confirm = reply.confirm
  }

  if (reply.entities) {
    extra.entities = reply.entities
  }

  // reply to quote message
  if (reply.reply_to) {
    extra.reply_to_message_id = reply.reply_to
  }

  if (reply.append && reply.message) {
    text = reply.message.text + reply.append
    extra.entities = reply.message.entities
  }

  return { text, photo, file, type, extra, card: reply.card }
}

function buildButton (button, reply, session) {
  const data = new URLSearchParams({
    ...button.data,
    ...button.event,
    scene: session && session.scene,
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

function formatMessageRaw (reply) {
  const { text, photo, extra } = formatMessage(reply, {})
  return { text, photo, ...extra }
}

module.exports = {
  formatMessageRaw,
  formatMessage,
  buildButton
}
