const mock = require('./http')
const debug = require('debug')('TEST:MOCK:SERVER')

debug(process.argv)
module.exports = mock.createMock(process.argv[2])
