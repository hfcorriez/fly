module.exports = {
  configBot: {
    name: 'telegram',
    entry: '/user',
    steps: {
    }
  },

  main ({ raw }, { send }) {
    send({
      text: 'aaaa',
      buttons: {
        detail: 'Detail',
        buy: 'Plan',
        plan: 'Detail',
        update: 'Update'
      },
      session: {
        id: 'aaaa'
      }
    })
  },

  detail ({ raw, session }, { send }) {
    send('ok received' + JSON.stringify(session))
  }
}
