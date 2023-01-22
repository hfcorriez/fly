
class FlyError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
  }
}

/**
 * extra.errors
 * - key: name
 *   path: nested.name
 *   message: something error
 */
class FlyValidateError extends Error {
  constructor (message, extra) {
    super(message)
    this.name = this.constructor.name
    if (extra && extra.errors) {
      Object.assign(this, extra)
    }
    this.isValidateError = true
  }
}

module.exports = {
  FlyError,
  FlyValidateError
}
