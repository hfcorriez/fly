const Client = {}

Client.Http = require('./http')
Client.Discover = require('./discover')
Client.Service = require('./service')
Client.Kv = require('./kv')
Client.Event = require('./event')

module.exports = Client
