const FlyLoader = require('../lib/loader')
const path = require('path')

const startTime = Date.now()

const options = {
  dir: path.join(__dirname, '../templates/project'),
  mounts: {
    $: path.join(__dirname, '../functions'),
    '': path.join(__dirname, '../templates/project')
  },
  ignore: [
    'node_modules/**'
  ]
}
const flyLoader = new FlyLoader(options)
console.log(flyLoader.list())

console.log(Date.now() - startTime)
