module.exports = {
  name: 'testExport',
  main: async function (event, ctx) {
    await ctx.call('testFunction')
    console.log('export function', ctx)
  }
}
