exports.add = async function (event, ctx) {
  await ctx.async('fly-server@app.list', {}, 'queue.process')

  return { body: 'ok' }
}

exports.process = function (event) {
  console.log('Ready process ', event)

  return { ok: true }
}
