module.exports = {
  main (event) {
    console.log(event.files, event.body)
    return {
      body: 'ok'
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
