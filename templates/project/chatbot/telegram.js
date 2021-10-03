module.exports = {
  configBot: {
    name: 'telegram',
    entry: '/user',
    steps: {
    }
  },

  main ({ text, raw }, { send }) {
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

  detail ({ from, raw, session }, { send }) {
    send('ok received ' + JSON.stringify(session))
  },

  update ({ from, raw, session }, { update }) {
    update({
      text: 'done ' + JSON.stringify(session),
      buttons: {
        back: 'Back'
      }
    })
  }
}
