const BaseApi = require('./base-api')

const USERS = {
  'uuid_1': { username: 'smartGuy', age: 16 },
  'uuid_2': { username: 'superMan', age: 1000 }
}
class LoginUser extends BaseApi {
  constructor () {
    super()
    this.configHttp = {
      path: '/api/loginUser',
      method: 'POST'
    }
  }
  async main (event, ctx) {
    const user = USERS[event.uuid]
    if (!user) {
      throw new Error('user not found, will log by sentry')
    }
    console.log(user)
    return ctx.userLogin(user)
  }
  // override
  async catchHttp (error) {
    const resp = super.catchHttp(error)
    resp.status = 500
    return resp
  }
}

module.exports = LoginUser

/*
curl \
   -X POST \
  'http://127.0.0.1:5000/api/loginUser' \
  -H 'X-Fly-UUID: uuid_1' \
  -d '{}'
*/
