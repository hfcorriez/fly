const axios = require('axios')

module.exports = ({ account, zone, method = 'get', path, email, key, type, data }) => {
  const prefix = account ? `/accounts/${account}` : `/zones/${zone}`
  return axios({
    url: `https://api.cloudflare.com/client/v4/` + prefix + path,
    method,
    headers: {
      'X-Auth-Email': email,
      'X-Auth-Key': key,
      'Content-Type': type || 'application/json'
    },
    data
  })
    .then(res => res.data.result)
    .catch(err => {
      if (err.response && err.response.data) {
        throw new Error(err.response.data.errors[0].message)
      }
      throw err
    })
}
