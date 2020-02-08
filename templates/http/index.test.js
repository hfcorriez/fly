const assert = require('assert')

module.exports = {
  tests: [{
    name: 'test http result',
    event: {},
    test (result) {
      assert.ok(typeof result === 'object')
      assert.ok(typeof result.body === 'object')
    }
  }]
}
