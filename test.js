const FlyCache = require('./lib/cache')
const FlyLoader = require('./lib/loader')
const path = require('path')

const startTime = Date.now()

const options = {
  dir: path.join(__dirname, '../malus-server'),
  mounts: {
    $: path.join(__dirname, './functions'),
    '': path.join(__dirname, '../malus-server')
  },
  ignore: [
    'node_modules/**',
    'config/**',
    'data/**',
    'public/**',
    'web/**',
    'service/bots/lib/**',
    'lib/**',
    'scripts/**',
    'bin/**',
    'test/**',
    'tests/**',
    'marketing/articles/**',
    'marketing/content-monitor/**',
    'marketing/seo-sites/**',
    'ops/mongo-shell/**',
    'bss/payment/lib/**',
    'gfw-loader.js',
    'bss/lib/**'
  ]
}
// const flyLoader = new FlyLoader(options)
// console.log(flyLoader.list())

const flyCache = new FlyCache(options)
flyCache.compile()
flyCache.save()
console.log(flyCache.all(), flyCache.path())

console.log(Date.now() - startTime)
