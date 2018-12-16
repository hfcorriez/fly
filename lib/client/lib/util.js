exports.hash = function (name) {
  return require('crypto').createHash('sha1').update(name).digest('hex').substr(-6)
}

exports.key = function () {
  return 'fly:' + Array.prototype.slice.call(arguments).map(val => val.toLowerCase()).join(':')
}
