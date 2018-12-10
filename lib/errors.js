class ServiceError extends Error {
  constructor (message, code) {
    // Calling parent constructor of base Error class.
    super(message)

    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name

    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor)

    // You can use any additional properties you want.
    // I'm going to use preferred HTTP status for this error types.
    // `500` is the default value if not specified.
    this.code = code
  }
}

class SystemError extends ServiceError {
  constructor (message, code) {
    super(message || 'system error', 1)
  }
}

class RetryFailedError extends SystemError {
  constructor (message, code) {
    super(message || 'retry too much')
  }
}

class AddressInUse extends SystemError {
  constructor (message, code) {
    super(message || 'address in use')
  }
}

class DirLoadError extends SystemError {
  constructor (message, code) {
    super(message || 'dir can not load')
  }
}

class FunctionNotFoundError extends ServiceError {
  constructor (message, code) {
    super(message || 'function not found', 10)
  }
}

class CalleeNotFoundError extends ServiceError {
  constructor (message, code) {
    super(message || 'callee not found', 11)
  }
}

class ServerUnavailableError extends ServiceError {
  constructor (message, code) {
    super(message || 'server unavailable', 12)
  }
}

exports.ServiceError = ServiceError
exports.RetryFailedError = RetryFailedError
exports.AddressInUse = AddressInUse
exports.DirLoadError = DirLoadError
exports.FunctionNotFoundError = FunctionNotFoundError
exports.CalleeNotFoundError = CalleeNotFoundError
exports.ServerUnavailableError = ServerUnavailableError
