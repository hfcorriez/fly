module.exports = {
  main (event) {
    console.log(event.files, event.body)
  },

  after (event) {
    return (event && event.redirect) ? event : {
      body: { code: 0, data: event }
    }
  },

  error (err) {
    return {
      body: { code: 1, message: err ? err.message : 'unknown error' }
    }
  },

  configHttp: {
    method: 'post',
    path: '/upload',
    upload: {
      maxSize: 5242880, // 5MB
      allowTypes: ['image/*', 'application/octet-stream'] // 图片, .log 日志
    }
  }
}
