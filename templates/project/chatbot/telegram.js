module.exports = {
  configBot: {
    name: 'telegram',
    entry: ['/user', /nihao/],
    actions: {
    }
  },

  main ({ text, raw }, { bot }) {
    bot.send({
      text: 'aaaa',
      buttons: {
        detail: 'Detail',
        update: 'Update',
        delete: 'Delete',
        quote: 'Quote'
      },
      session: {
        id: 'aaaa'
      }
    })
  },

  detail ({ message, raw, session }, { bot }) {
    bot.send('ok received ' + JSON.stringify(session))
  },

  update ({ message, raw, session }, { bot }) {
    return bot.update({
      text: 'done ' + JSON.stringify(session),
      buttons: {
        back: 'Back'
      }
    })
  },

  async delete ({ message, session }, { bot }) {
    await bot.delete(message.message_id)
    await bot.send('message deleted ' + JSON.stringify(message))
  }
}
