exports.main = async function (event) {
  return {
    body: {
      cookies: event.cookies,
      sessions: event.sessions
    }
  }
}
