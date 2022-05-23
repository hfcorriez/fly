module.exports = (event, { name }) => {
  return { event, context: { name } }
}
