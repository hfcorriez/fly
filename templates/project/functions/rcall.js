module.exports = {
  main (event, { $apiCall }) {
    return $apiCall({
      url: 'http://localhost:4000',
      name: 'data',
      key: 'abc'
    })
  }
}
