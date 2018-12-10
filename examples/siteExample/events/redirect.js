exports.main = async function (event) {
  return { redirect: '/events?' + Math.random() }
}
