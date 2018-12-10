exports.list = async function (event, ctx) {
  return ctx.call('fly-server@app.list')
}
