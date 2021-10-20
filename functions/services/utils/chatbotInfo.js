module.exports = {
  configChatbot: {
    service: '*',
    entry: ['/info']
  },

  main ({ message, bot }, { chatbot }) {
    const pkg = require('../../../package.json')

    chatbot.send({
      markdown: `*SYSTEM INFO*
\\[Your ID\\]  \`${message.from.id}\`
\\[Chat ID\\]  \`${message.chat.id}\`
\\[Bot   ID\\]  \`${bot.id}\`
\\[Version\\]  \`${pkg.version}\``
    })
  }
}
