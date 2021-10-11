module.exports = (err, ctx) => {
  return {
    body: {
      error: err.message
    }
  }
}
