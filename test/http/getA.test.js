const assert = require('assert')
const mock = require('../../lib/mock/http')
const path = require('path')
const axios = require('axios')

describe('test mock a', async function () {
  this.timeout(10000)
  before(async () => {
    await mock.startFlyHttpServer({
      cwd: path.join(__dirname, 'server'),
      env: {
        NODE_ENV: 'test',
        DEBUG: 'TEST*'
      },
      uid: 0,
      gid: 0
    })
  })
  it('getA use b.mock.js', async () => {
    await mock.startMockServer(path.join(__dirname, './server/lib/mock.js'))
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'mock@mock.com',
        a: true,
        lib: 8
      }
    })
    await mock.stopMockServer(path.join(__dirname, './server/lib/mock.js'))
  })
  it('getA not use b.mock.js', async () => {
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
})

//  yarn test -- test/http/getA.test.js
