const assert = require('assert')

module.exports = {
  tests: [
    {
      name: 'status === 1',
      event: { username: '1', password: '1' },
      check (result) {
        assert.strictEqual(result.status, 1)
      }
    },
    {
      name: 'invalid username trigger validate error',
      event: { },
      check (result) {
        assert.ok(result instanceof Error && result.name === 'FlyValidateError')
      }
    }
  ]
}
