exports.start = function (event) {
  console.log('start', event)
}

exports.error = function (event) {
  console.log('error', event)
}

exports.stop = function (event) {
  console.log('stop', event)
}
