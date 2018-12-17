const Fly = require('../lib/fly')
const fly = new Fly('lib/service')
fly.add('web', 'test/example')

~~(async () => {
  // console.log('functions', fly.list())

  //await fly.call('http-server')
  await fly.call('command', { argv: process.argv.slice(2) })
  // await fly.call('testFunction')
})()
