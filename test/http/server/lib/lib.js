const v = {
  c: 1
}

exports.c1 = async function c1 (i) {
  console.log(v)
  return v.c + i
}
