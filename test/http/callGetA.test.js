const { flyCall } = require('../../lib/mock/call')
const assert = require('assert')

describe('test call', function () {
  it('call getA', async () => {
    const result = await flyCall({
      modulePath: require.resolve('./server/getA.js'),
      mockPath: require.resolve('./getA.mock.js'),
      event: { }
    }, {
      cwd: __dirname
    })
    assert.strict.deepEqual(result, {
      email: 'mock@mock.com0',
      a: true,
      lib: 8
    })
  })
})
