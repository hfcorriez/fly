module.exports = (err, ctx) => {
  return {
    body: {
      ok: false,
      message: err.message
    }
  }
}
