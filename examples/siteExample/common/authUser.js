exports.main = async function (event, ctx, next) {
  ctx.user = {
    name: 'hank'
  }
}
