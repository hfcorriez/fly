
const Fly = require('../lib/fly')

module.exports = {
  main: async function (event, ctx) {
    const fly = new Fly()
    let fn = fly.get(event.params[0])
    if (!fn) fn = ctx.get(event.params[0])
    console.log(JSON.stringify(fn, null, 4))
  },

  configCommand: {
    _: 'show <fn>',
    descriptions: {
      _: 'Show function info',
      '<fn>': 'Function name'
    }
  }
}
