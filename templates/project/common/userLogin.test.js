const assert = require('assert')

module.exports = {
  tests: [
    {
      name: 'status === 1',
      event: { username: '1', password: '1' },
      test (result) {
        assert.strictEqual(result.status, 1)
      }
    },
    {
      name: 'invalid username trigger validate error',
      event: { },
      test (result) {
        assert.ok(result instanceof Error && result.name === 'FlyValidateError')
      }
    }
  ]
}
