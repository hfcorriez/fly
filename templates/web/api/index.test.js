const assert = require('assert')

module.exports = {
  tests: [
    {
      name: '检测结果正确',
      event: {},
      result (result) {
        assert.strictEqual(result.code, 0)
        return true
      }
    }
  ]
}
