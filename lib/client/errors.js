class ClientError extends Error {
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

class HttpError extends ClientError {
  constructor (message, code) {
    super(message || 'http call error', 1)
  }
}

class UnknownProtocolError extends ClientError {
  constructor (message, code) {
    super(message || 'unknown protocol', 101)
  }
}

class ServiceUnknownError extends ClientError {
  constructor (message, code) {
    super(message || 'unknown service', 101)
  }
}

class DisallowMultipleInstanceError extends ClientError {
  constructor (message, code) {
    super(message || 'disallow multiple instances', 101)
  }
}

class HttpClientError extends ClientError {
  constructor (message, code) {
    super(message || 'http gateway error', code || 110)
  }
}

class FunctionNotFoundError extends ClientError {
  constructor (message, code) {
    super(message || 'function not found', 111)
  }
}

class FunctionCallError extends ClientError {
  constructor (message, code) {
    super(message || 'function call error', 112)
  }
}

class NodeUnavailableError extends ClientError {
  constructor (message, code) {
    super(message || 'nodes unavailable', 113)
  }
}

class IllegalReturnError extends ClientError {
  constructor (message, code) {
    super(message || 'illegal return', 114)
  }
}

exports.ClientError = ClientError
exports.DisallowMultipleInstanceError = DisallowMultipleInstanceError
exports.UnknownProtocolError = UnknownProtocolError
exports.HttpClientError = HttpClientError
exports.FunctionCallError = FunctionCallError
exports.FunctionNotFoundError = FunctionNotFoundError
exports.NodeUnavailableError = NodeUnavailableError
exports.IllegalReturnError = IllegalReturnError
exports.ServiceUnknownError = ServiceUnknownError

exports.HttpError = HttpError
