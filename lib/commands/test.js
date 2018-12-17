module.exports = {
  links: {
    'lib': 'test/example-lib'
  },

  main: async function (event, ctx) {
    let result = await ctx.call('lib@request')
    return { result, test: '1', a: { b: 'c' }, 'hello': ['a', 'c', 'd'] }
  }
}
