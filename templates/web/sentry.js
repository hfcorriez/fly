const Sentry = require('@sentry/node')
const ENV_WHITELIST = ['NODE_ENV', 'HOSTNAME', 'LOGNAME', 'LANGUGE']
Sentry.init({
  dsn: 'http://69396d03934d4f87a1c70dec7e4d771c@localhost:9000/2'
})

Sentry.configureScope(scope => {
  Object.keys(process.env)
    .filter(k => {
      return ENV_WHITELIST.includes(k) || k.toUpperCase().startsWith('MALUS')
    })
    .forEach(k => {
      scope.setExtra('ENV:' + k, process.env[k])
    })
})

module.exports = {
  configError: true,

  main (event) {
    const err = event
    if (err instanceof Error) {
      Sentry.captureException(err)
    } else if (['object', 'string', 'number'].indexOf(typeof event) !== -1) {
      Sentry.captureMessage(err.toString())
    }
  }
}
