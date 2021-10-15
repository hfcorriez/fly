module.exports = (event, ctx) => {
  // console.log('apioutput', event)
  return {
    body: {
      ok: true,
      message: null,
      data: event
    }
  }
}
