const assert = require('assert')

module.exports = {
  tests: [
    {
      name: 'Check code === 0',
      event: {},
      result (result) {
        assert.strictEqual(result.code, 0)
        return true
      }
    }
  ]
}
