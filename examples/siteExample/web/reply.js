exports.main = async function (event) {
  return `hello from server [reply to "${event.message}"]`
}
