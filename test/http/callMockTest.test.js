const { flyCall } = require('../../lib/mock/call')
const assert = require('assert')

describe('test call', function () {
  it('call mockTest', async () => {
    const result = await flyCall({
      modulePath: require.resolve('./server/mockTest.js'),
      mockPath: require.resolve('./mockTest.mock.js'),
      event: { }
    }, {
      cwd: __dirname
    })
    assert.strict.deepEqual(result, {
      fly: 'mock fly value',
      lib: 'mock lib value',
      rewired: false
    })
  })
})
