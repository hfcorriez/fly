exports.connect = function (event, ctx) {
  return {
    body: {
      settings: ctx.app.settings,
      event: event
    }
  }
}

exports.message = function (event) {
  return { redirect: '/events?' + Math.random() }
}
