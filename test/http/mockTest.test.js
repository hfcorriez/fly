const assert = require('assert')
const MockServer = require('../../lib/mock/http')
const path = require('path')
const axios = require('axios')
const debug = require('debug')('TEST:GET:A')

const mock = new MockServer({
  cwd: path.join(__dirname, 'server'),
  env: {
    NODE_ENV: 'test',
    DEBUG: '*'
  }
})
describe('test mock a', async function () {
  this.timeout(10000)
  before(async () => {
    await mock.start()
  })
  after(async () => {
    mock.exit()
  })
  it('start mockTest.mock.js', async () => {
    const { data } = await axios.get('http://127.0.0.1:5000/api/mockTest')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        fly: 'mock fly value',
        lib: 'mock lib value',
        rewired: false
      }
    })
  })
  it('stop mockTest.mock.js', async () => {
    await mock.stop()
    const { data } = await axios.get('http://127.0.0.1:5000/api/mockTest')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        fly: 'original fly value',
        lib: 'original lib value'
      }
    })
  })
  it('start and rewire mockTest.mock.js', async () => {
    await mock.start()
    await mock.rewire({ rewired: true })
    const { data } = await axios.get('http://127.0.0.1:5000/api/mockTest')
    debug(data)
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        fly: 'mock fly value',
        lib: 'mock lib value',
        rewired: true
      }
    })
  })
})

//  yarn test test/http/mockTest.test.js
