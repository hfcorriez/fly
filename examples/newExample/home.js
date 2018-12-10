const path = require('path')

exports.main = function (event) {
  /* Here is your logic */
  return { file: path.join(__dirname, '/index.html') }
}
