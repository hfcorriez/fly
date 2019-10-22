const mock = require('../../lib/mock-http')

module.exports = mock.createMock({
  b: async (event) => {
    return { email: 'c@c.com', ...event }
  }
})
