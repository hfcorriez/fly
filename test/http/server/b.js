
module.exports = {
  async main (event) {
    return { email: 'b@b.com', ...event }
  }
}
