module.exports = function ({ string }) {
  return { string: string.charAt(0).toUpperCase() + string.slice(1) }
}
