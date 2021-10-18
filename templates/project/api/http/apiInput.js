module.exports = (event, ctx) => {
  ctx.fly.info('execute apiInput')
  ctx.user = { name: 'main' }
  return event
}
