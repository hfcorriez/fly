module.exports = {
  main: (event) => {
    console.log('event', event)
  },

  afterChatbot (event, { chatbot }) {
    chatbot.send({
      text: 'executed: ' + this.name
    })
  }
}
