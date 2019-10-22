const assert = require('assert')
const mock = require('../../lib/mock-http')
const path = require('path')
const axios = require('axios')

describe('test mock a', async function () {
  this.timeout(10000)
  before(async () => {
    await mock.startFlyHttpServer({
      cwd: path.join(__dirname, 'server'),
      env: {
        DEBUG: 'TEST:*',
        NODE_ENV: 'test'
      },
      uid: 0,
      gid: 0
    })
  })
  it('getA use b.mock.js', async () => {
    await mock.startMockServer(path.join(__dirname, './b.mock.js'))
    const { data } = await axios.get('http://127.0.0.1:5000/api/getA')
    assert.strict.deepEqual(data, {
      code: 0,
      data: {
        email: 'c@c.com',
        a: true
      }
    })
    await mock.stopMockServer()
  })
})

//  yarn test -- test/http/getA.test.js
