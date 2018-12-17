const path = require('path')
const request = require('request')

exports.main = function (event) {
  /* Here is your logic */
  return { file: path.join(__dirname, '/index.html') }
}
