const Validator = require('validator')
const dayjs = require('dayjs')

const { FlyValidateError } = require('./error')
const TYPE_NAMES = [Date, Number, Boolean, Array, Object, String]

module.exports = {
  /**
   * Define mapper to process
   */
  validateMapper: {
    email: 'isEmail',
    alpha: 'isAlpha',
    base32: 'isBase32',
    base64: 'isBase64',
    hexcolor: 'isHexColor',
    hash: ['isHash', (config) => config.algorithm],
    hex: 'isHexadecimal',
    ip: 'isIP',
    json: 'isJSON',
    jwt: 'isJWT',
    lowercase: 'isLowercase',
    macaddress: 'isMACAddress',
    mimetype: 'isMimeType',
    number: input => typeof input === 'number' || Validator.isNumeric(input),
    port: 'isPort',
    url: 'isURL',
    uppercase: 'isUppercase',
    alphanumeric: 'isAlphanumeric',
    locale: 'isLocale',
    fadn: 'isFADN',
    ascii: 'isASCII',
    float: input => Number(input) === input && input % 1 !== 0,
    object: input => typeof input === 'object',
    array: input => Array.isArray(input),
    pattern: (input, definition) => {
      return definition.pattern && definition.pattern instanceof RegExp && definition.pattern.test(input)
    },
    enum: (input, definition) => {
      return definition.enum && definition.enum.includes(input)
    },
    date: input => {
      const date = dayjs(input)
      if (!date.isValid()) return false
    },
    boolean: input => typeof input === 'boolean',
    string: (input) => typeof input === 'string',
    validator: (input, definition) => typeof definition.validate === 'function' && definition.validate(input, definition)
  },

  /**
   * Define transformers
   */
  validateTransformer: {
    string: (value, definition) => {
      if (definition.uppercase) {
        value = value.toUpperCase()
      } else if (definition.lowercase) {
        value = value.toLowerCase()
      }
      if (definition.trim) {
        value = value.trim()
      }
      return value
    },
    date: (value, definition) => {
      switch (definition.format) {
        case 'date':
          return dayjs(value).foramt('YYYY-MM-DD')
        case 'datetime':
          return dayjs(value).foramt('YYYY-MM-DD HH:mm:ss')
        case 'iso':
          return dayjs(value).format()
        case 'seconds':
        case 's':
          return dayjs(value).unix()
        case 'milliseconds':
        case 'ms':
          return dayjs(value).valueOf()
        default:
          return value
      }
    }
  },

  /**
   * Validate event
   */
  validateEvent (event, props) {
    const errors = []

    Object.keys(props).forEach(key => {
      const { valid, value, type, message } = this.validateOne(event[key], props[key])
      if (!valid) {
        errors.push({
          key,
          // @todo change to real path
          path: key,
          type,
          input: event[key],
          message
        })
      } else if (value !== event[key]) {
        event[key] = value
      }
    })

    if (errors.length) {
      throw new FlyValidateError(`validate failed: ${errors.map(error => error.path).join(', ')}`, { errors })
    }

    return event
  },

  /**
   * Validate one key
   *
   * @param {Any} input
   * @param {String|Object} definition
   * @todo handle nested props
   */
  validateOne (input, definition) {
    if (!definition) {
      return { valid: true, value: input, type: 'none' }
    }

    definition = typeof definition === 'object' ? definition : { type: definition, required: true }

    let type = definition.type
    let value
    let valid = false

    // Support use type interface
    if (TYPE_NAMES.includes(type)) {
      type = type.toString().match(/ ([a-zA-Z]+)\(/)[1].toLowerCase()
    }

    if (definition.before && typeof definition.before === 'function') {
      input = definition.before(input, definition)
    }

    if (typeof input === 'undefined') {
      if (!definition.required || definition.optional) {
        valid = true
        value = definition.default
      } else {
        return {
          valid: false,
          value: undefined,
          type: 'required',
          message: definition.message || 'value is required'
        }
      }
    } else if (this.validateMapper[type]) {
      if (typeof input === 'string' && definition.pretrim) input = input.trim()
      const map = this.validateMapper[type]
      if (typeof map === 'function') {
        valid = map(input, definition)
      } else if (Array.isArray(map)) {
        valid = Validator[map[0]](input, typeof map[1] === 'function' ? map[1](definition) : map[1])
      } else if (typeof map === 'string') {
        valid = Validator[map](input)
      }
      if (valid) value = input
    } else {
      valid = true
      value = input
    }

    // Support after as function to define custom transformer
    if (typeof value !== 'undefined' && valid && this.validateTransformer[type]) {
      const transformer = this.validateTransformer[type]
      value = transformer(value, definition)
    }

    // Support after as function to define custom transformer
    if (definition.after && typeof definition.after === 'function') {
      value = definition.after(value, definition)
    }

    return {
      valid,
      value,
      type,
      message: definition.message || 'validate failed'
    }
  }
}
