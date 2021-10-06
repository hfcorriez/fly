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
        'File',
        'Update',
        'Delete',
        { text: 'Data', action: 'Data', data: { type: 'display' } },
        'Confirm',
        'Condition'
      ],
      buttonsOptions: { columns: 4 },
      session: {
        test: 'aaaa'
      }
    })
  },

  actionCondition (_, { chatbot }) {
    chatbot.send({
      text: 'which type do you want, beer or food?',
      actions: {
        Beer: 'beer',
        Food: /food/
      }
    })
  },

  actionConfirm (_, { chatbot }) {
    chatbot.send({
      text: 'do you need confirm?',
      confirm: {
        yes: 'ConfirmYes',
        no: 'ConfirmNo'
      }
    })
  },

  actionConfirmYes (_, { chatbot }) {
    chatbot.send('you select YES')
  },

  actionConfirmNo (_, { chatbot }) {
    chatbot.send('you select NO')
  },

  actionBeer (_, { chatbot }) {
    chatbot.send('ok give you beer')
  },

  actionFood (_, { chatbot }) {
    chatbot.send('food is ready')
  },

  actionData ({ data }, { chatbot }) {
    chatbot.send('data received ' + JSON.stringify(data))
  },

  actionPhoto (_, { chatbot }) {
    chatbot.send({ text: 'Banner', photo: require('path').join(__dirname, '../../../docs/banner.png') })
  },

  actionFile (_, { chatbot }) {
    chatbot.send({ file: require('path').join(__dirname, '../../../README.md') })
  },

  actionDetail ({ session }, { chatbot }) {
    chatbot.send('ok received ' + JSON.stringify(session))
  },

  actionUpdate ({ session }, { chatbot }) {
    return chatbot.update({
      card: 'main',
      markdown: '*done* ```javascript\n' + JSON.stringify(session) + '```',
      buttons: [
        { text: 'Back', action: '_back', data: { card: 'main' } }
      ]
    })
  },

  async actionDelete ({ message }, { chatbot }) {
    await chatbot.delete(message.message_id)
    await chatbot.send('message deleted ' + JSON.stringify(message))
  }
}
