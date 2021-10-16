module.exports = {
  configChatbot: {
    service: 'chatbot',
    entry: ['/redirect']
  },

  main ({ data }, { chatbot }) {
    chatbot.send({
      card: 'main',
      text: '*NEW* redirect ok ' + JSON.stringify(data),
      buttons: [
        ['Button 1a', 'Button 1b', 'Button 1c'],
        ['Button 2']
      ]
    })
  },

  async delete ({ data, message }, { chatbot }) {
    await chatbot.delete(data.from)
    await chatbot.send('message delete: ' + JSON.stringify(message))
  }
}
