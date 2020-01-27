const assert = require('assert')

module.exports = {
  tests: [
    {
      name: 'Check code === 0',
      event: {},
      check (result) {
        assert.ok(typeof result === 'object')
        assert.strictEqual(result.code, 0)
      }
    }
  ]
}
