exports.add = async function (event, ctx) {
  await ctx.broadcast('event.process', ctx.app.settings)
}

exports.process = async function (event, ctx) {
  console.log('process event', event)
}

exports.process2 = async function (event, ctx) {
  console.log('process event2', event)
}
