const Fly = require('../lib/fly')
const fly = new Fly('examples/example')

~~(async () => {
  console.log('functions', fly.list())

  await fly.call('testExport')
  await fly.call('testFunction')
})()
