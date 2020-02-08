const assert = require('assert')

module.exports = {
  tests: [
    {
      name: 'Check code === 0',
      event: {
        method: 'post',
        body: { code: 0 }
      },
      check (result) {
        assert.ok(typeof result === 'object')
        assert.strictEqual(result.code, 0)
      }
    }
  ]
}
