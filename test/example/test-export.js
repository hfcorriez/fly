module.exports = {
  name: 'testExport',
  main: async function (event, ctx) {
    console.log('export function', ctx)
  }
}
