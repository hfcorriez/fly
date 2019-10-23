const { flyCall } = require('../../lib/mock/call')
const assert = require('assert')
const path = require('path')

describe('test call', function () {
  it('call getA', async () => {
    const result = await flyCall({
      modulePath: require.resolve('./server/getA.js'),
      mockPath: require.resolve('./server/lib/mock.js'),
      event: { }
    }, {
      cwd: __dirname
    })
    assert.strict.deepEqual(result, {
      email: 'mock@mock.com',
      a: true,
      lib: 8
    })
  })
})
