const Fly = require('../lib/fly')
const fly = new Fly('lib/service')
fly.add('web', 'examples/example')

~~(async () => {
  // console.log('functions', fly.list())

  //await fly.call('http-server')
  await fly.call('api-server')
  // await fly.call('testFunction')
})()
