const Redis = require('ioredis')

const instances = []

module.exports = function (config) {
  const key = JSON.stringify(config)

  if (!instances[key]) {
    instances[key] = new Redis(config)
  }

  return instances[key]
}
