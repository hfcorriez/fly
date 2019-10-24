const assert = require('assert')
const mock = require('../../lib/mock/http')
const path = require('path')
const axios = require('axios')
const debug = require('debug')('TEST:GET:A')

describe('test mock a', async function () {
  this.timeout(10000)
  before(async () => {
    await mock.startFlyHttpServer({
      cwd: path.join(__dirname, 'server'),
      env: {
        NODE_ENV: 'test',
        DEBUG: '*'
      }
    })
  })
  it('getA use getA.mock.js', async () => {
    await mock.startMockServer()
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'mock@mock.com0',
        a: true,
        lib: 8
      }
    })
    await mock.stopMockServer()
  })
  it('getA not use getA.mock.js', async () => {
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'b@b.com',
        a: true,
        lib: 3
      }
    })
  })
  mock.itMock('getA use getA.mock.js 2', async () => {
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    debug(data)
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'mock@mock.com0',
        a: true,
        lib: 8
      }
    })
  })
  it('getA not use getA.mock.js 2', async () => {
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'b@b.com',
        a: true,
        lib: 3
      }
    })
  })
  mock.itMock('getA use rewired b.mock.js', async () => {
    await mock.rewireMockServer({ toRewired: 1 })
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    debug(data)
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'mock@mock.com1',
        a: true,
        lib: 9
      }
    })
  })
})

//  yarn test -- test/http/getA.test.js
