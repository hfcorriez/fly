const Fly = require('../lib/fly')
const fly = new Fly('lib/service')
fly.add('test/example', 'example')

~~(async () => {
  // console.log('functions', fly.list())

  //await fly.call('http-server')
  await fly.call('http-server')
  // await fly.call('testFunction')
})()
