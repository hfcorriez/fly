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
      buttons: [
        'Detail',
        { text: 'Google', url: 'https://www.google.com' },
        'Photo',
        'Update',
        'Delete',
        { text: 'Data', action: 'data', data: { type: 'display' } },
        'Condition'
      ],
      buttonsOptions: { columns: 2 },
      session: {
        test: 'aaaa'
      }
    })
  },

  condition (_, { bot }) {
    bot.send({
      text: 'which type do you want, beer or food?',
      actions: {
        beer: 'beer',
        food: /food/
      }
    })
  },

  data ({ data }, { bot }) {
    bot.send('data received ' + JSON.stringify(data))
  },

  photo (_, { bot }) {
    bot.send({ text: 'Banner', photo: require('path').join(__dirname, '../../../docs/banner.png') })
  },

  beer (_, { bot }) {
    bot.send('ok give you beer')
  },

  food (_, { bot }) {
    bot.send('food is ready')
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
