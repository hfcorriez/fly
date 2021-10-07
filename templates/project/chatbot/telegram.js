module.exports = {
  configChatbot: {
    name: 'telegram',
    entry: ['/user', /nihao/]
  },

  main (_, { chatbot }) {
    chatbot.send({
      card: 'main',
      markdown: '*START* Please select feautre:',
      buttons: [
        'Detail',
        { text: 'Google', url: 'https://www.google.com' },
        'Photo',
        'Upload',
        'Update',
        'Delete',
        { text: 'Data', action: 'data', data: { type: 'display' } },
        'Confirm',
        'Condition'
      ],
      buttonsOptions: { columns: 4 },
      session: {
        test: 'aaaa'
      }
    })
  },

  condition (_, { chatbot }) {
    chatbot.send({
      text: 'which type do you want, beer or food?',
      s: {
        Beer: 'beer',
        Food: /food/
      }
    })
  },

  conditionBeer (_, { chatbot }) {
    chatbot.send('ok give you beer')
  },

  conditionFood (_, { chatbot }) {
    chatbot.send('food is ready')
  },

  confirm (_, { chatbot }) {
    chatbot.send({
      text: 'do you need confirm?',
      confirm: {
        yes: 'ConfirmYes',
        no: 'ConfirmNo'
      }
    })
  },

  confirmYes (_, { chatbot }) {
    chatbot.send('you select YES')
    chatbot.delete()
  },

  confirmNo (_, { chatbot }) {
    chatbot.send('you select NO')
  },

  data ({ data }, { chatbot }) {
    chatbot.send('data received ' + JSON.stringify(data))
  },

  photo (_, { chatbot }) {
    chatbot.send({ text: 'Banner', photo: require('path').join(__dirname, '../../../docs/banner.png') })
  },

  upload (_, { chatbot }) {
    chatbot.send({ file: require('path').join(__dirname, '../../../README.md') })
  },

  detail ({ session }, { chatbot }) {
    chatbot.send('ok received ' + JSON.stringify(session))
  },

  update ({ session }, { chatbot }) {
    return chatbot.update({
      card: 'main',
      markdown: '*done* ```javascript\n' + JSON.stringify(session) + '```',
      buttons: [
        { text: 'Back', action: '_back', data: { card: 'main' } }
      ]
    })
  },

  async delete ({ data, message }, { chatbot }) {
    await chatbot.delete(data.from)
    await chatbot.send('message delete: ' + JSON.stringify(message))
  }
}
