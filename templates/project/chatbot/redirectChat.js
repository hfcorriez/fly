module.exports = {
  configChatbot: {
    service: 'chatbot',
    entry: ['/redirect']
  },

  main ({ data }, { chatbot }) {
    chatbot.send({
      card: 'main',
      text: '*NEW* redirect ok ' + JSON.stringify(data)
    })
  },

  async delete ({ data, message }, { chatbot }) {
    await chatbot.delete(data.from)
    await chatbot.send('message delete: ' + JSON.stringify(message))
  }
}
