exports.main = (event) => {
  return {
    file: require('path').join(__dirname, event.params[0])
  }
}
