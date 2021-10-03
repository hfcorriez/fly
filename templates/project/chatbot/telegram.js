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
        'File',
        'Update',
        'Delete',
        { text: 'Data', action: 'Data', data: { type: 'display' } },
        'Condition'
      ],
      buttonsOptions: { columns: 4 },
      session: {
        test: 'aaaa'
      }
    })
  },

  actionCondition (_, { bot }) {
    bot.send({
      text: 'which type do you want, beer or food?',
      actions: {
        Beer: 'beer',
        Food: /food/
      }
    })
  },

  actionBeer (_, { bot }) {
    bot.send('ok give you beer')
  },

  actionFood (_, { bot }) {
    bot.send('food is ready')
  },

  actionData ({ data }, { bot }) {
    bot.send('data received ' + JSON.stringify(data))
  },

  actionPhoto (_, { bot }) {
    bot.send({ text: 'Banner', photo: require('path').join(__dirname, '../../../docs/banner.png') })
  },

  actionFile (_, { bot }) {
    bot.send({ file: require('path').join(__dirname, '../../../README.md') })
  },

  actionDetail ({ message, raw, session }, { bot }) {
    bot.send('ok received ' + JSON.stringify(session))
  },

  actionUpdate ({ message, raw, session }, { bot }) {
    return bot.update({
      text: 'done ' + JSON.stringify(session),
      buttons: {
        back: 'Back'
      }
    })
  },

  async actionDelete ({ message, session }, { bot }) {
    await bot.delete(message.message_id)
    await bot.send('message deleted ' + JSON.stringify(message))
  }
}
