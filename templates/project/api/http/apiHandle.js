module.exports = () => {
  return {
    beforeHttp: ['apiInputParser', 'apiRateLimit'],
    afterHttp: ['apiRender'],
    catchHttp: ['apiError']
  }
}
