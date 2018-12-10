exports.main = async function (event) {
  return {
    body: 'Write ok!',
    cookies: { random: Math.random() },
    sessions: { uid: Math.random() }
  }
}
