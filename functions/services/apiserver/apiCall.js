const axios = require('axios')

module.exports = {
  async main ({ url, name, event, key, ctx }) {
    const headers = {
      'content-type': 'application/json',
      'x-fly-key': key || ''
    }

    const ret = (await axios({
      method: 'post',
      url: url,
      data: JSON.stringify({
        name,
        event,
        ctx
      }),
      headers,
      timeout: 10000
    })).data

    if (ret.code > 0) throw new Error(`remote call failed: ${ret.message || 'unknown'}`)
    return ret.data
  }
}
