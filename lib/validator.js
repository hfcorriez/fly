const Validator = require('validator')
const dayjs = require('dayjs')

const { FlyValidateError } = require('./error')
const TYPE_NAMES = [Date, Number, Boolean, Array, Object, String]

module.exports = {
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
    mac: 'isMACAddress',
    mimetype: 'isMimeType',
    number: 'isNumeric',
    port: 'isPort',
    url: 'isURL',
    uppercase: 'isUppercase',
    alphanumeric: 'isAlphanumeric',
    locale: 'isLocale',
    fadn: 'isFADN',
    ascii: 'isASCII',
    object: input => Object.isObject(input),
    array: input => Array.isArray(input),
    pattern: (input, definetion) => {
      return definetion.pattern && definetion.pattern instanceof RegExp && definetion.pattern.test(input)
    },
    enum: (input, definetion) => {
      return definetion.enum && definetion.enum.includes(input)
    },
    date: input => {
      const date = dayjs(input)
      if (!date.isValid()) return false
    },
    boolean: input => typeof input === 'boolean',
    string: (input) => typeof input === 'string'
  },

  validateTransformer: {
    String: (value, definetion) => {
      if (definetion.uppercase) {
        value = value.toUpperCase()
      } else if (definetion.lowercase) {
        value = value.toLowerCase()
      }
      if (definetion.trim) {
        value = value.trim()
      }
      return value
    },
    Date: (value, definetion) => {
      switch (definetion.format) {
        case 'DATE':
          return dayjs(value).foramt('YYYY-MM-DD')
        case 'DATETIME':
          return dayjs(value).foramt('YYYY-MM-DD HH:mm:ss')
        case 'ISO':
          return dayjs(value).format()
        case 'UNIX':
          return dayjs(value).unix()
        case 'VALUE':
          return dayjs(value).valueOf()
        default:
          return dayjs(value).toDate()
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
   * @param {String|Object} definetion
   * @todo handle nested props
   */
  validateOne (input, definetion) {
    if (!definetion) {
      return { valid: true, value: input, type: 'none' }
    }

    definetion = typeof definetion === 'object' ? definetion : { type: definetion }

    let type = definetion.type
    let value
    let valid = false

    // Support use type interface
    if (TYPE_NAMES.includes(type)) {
      type = type.toString().match(/ ([a-zA-Z]+)\(/)[1].toLowerCase()
    }

    if (definetion.before && typeof definetion.before === 'function') {
      input = definetion.before(input, definetion)
    }

    if (typeof input === 'undefined') {
      if (definetion.optional) {
        valid = true
        value = definetion.default
      } else {
        return {
          valid,
          value,
          type: 'required',
          message: 'value is required'
        }
      }
    } else if (this.validateMapper[type]) {
      if (typeof input === 'string' && definetion.pretrim) input = input.trim()
      const map = this.validateMapper[type]
      if (typeof map === 'function') {
        valid = map(input, definetion)
      } else if (Array.isArray(map)) {
        valid = Validator[map[0]](input, typeof map[1] === 'function' ? map[1](definetion) : map[1])
      } else if (typeof map === 'string') {
        valid = Validator[map](input)
      }
    }

    if (typeof input !== 'undefined' && valid && this.validateTransformer[type]) {
      const transformer = this.validateTransformer[type]
      value = transformer(input, definetion)
    }

    if (definetion.after && typeof definetion.after === 'function') {
      value = definetion.after(value, definetion)
    }

    return {
      valid,
      value,
      type,
      message: definetion.message
    }
  }
}
