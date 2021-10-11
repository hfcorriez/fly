module.exports = (event, ctx) => {
  ctx.fly.info('execute handleHttp:beforeHttp')
  event.handleHttp = true
  ctx.user = { name: 'main' }
  return event
}
