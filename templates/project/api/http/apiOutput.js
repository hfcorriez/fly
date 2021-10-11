module.exports = (event, ctx) => {
  console.log('apioutput', event)
  return {
    body: event
  }
}
