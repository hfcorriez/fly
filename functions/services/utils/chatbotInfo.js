module.exports = {
  configChatbot: {
    service: '*',
    entry: ['/info']
  },

  main ({ message, bot }, { chatbot }) {
    chatbot.send({
      markdown: `*SYSTEM INFO*
Your ID: \`${message.from.id}\`
Chat ID: \`${message.chat.id}\`
Chat Type: ${message.chat.type}
Bot ID: \`${bot.id}\`
`
    })
  }
}
