const store = {
  value: 'original lib value'
}

exports.libFn = async function libFn () {
  return {
    lib: store.value
  }
}
