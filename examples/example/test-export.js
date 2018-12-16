module.exports = {
  name: 'testExport',
  main: function (event, ctx) {
    console.log('export function', ctx.traces)
  }
}
