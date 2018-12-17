module.exports = {
  main: async function (event, ctx) {
    let links = ctx.links

    Object.keys(links).forEach(name => {
      console.log(`${name}: ${links[name]}`)
    })
  },
  events: {
    command: {
      _: 'link',
      args: {
        '--type': String,
      }
    }
  }
}
