module.exports = {
  configChatbot: {
    name: 'telegram',
    entry: ['/info', ':member_join']
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
