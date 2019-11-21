const Validator = require('validator')
const dayjs = require('dayjs')

const { FlyValidateError } = require('./error')

module.exports = {
  validateMapper: {
    Email: 'isEmail',
    Alpha: 'isAlpha',
    Base32: 'isBase32',
    Base64: 'isBase64',
    HexColor: 'isHexColor',
    Hash: ['isHash', (config) => config.algorithm],
    Hex: 'isHexadecimal',
    IP: 'isIP',
    JSON: 'isJSON',
    JWT: 'isJWT',
    Lowercase: 'isLowercase',
    MAC: 'isMACAddress',
    MimeType: 'isMimeType',
    Number: 'isNumeric',
    Port: 'isPort',
    URL: 'isURL',
    Uppercase: 'isUppercase',
    AlphaNumeric: 'isAlphaNumeric',
    Locale: 'isLocale',
    FADN: 'isFADN',
    ASCII: 'isASCII',
    Object: input => Object.isObject(input),
    Array: input => Array.isArray(input),
    Pattern: (input, definetion) => {
      return definetion.pattern && definetion.pattern instanceof RegExp && definetion.pattern.test(input)
    },
    Enum: (input, definetion) => {
      return definetion.enum && definetion.enum.includes(input)
    },
    Date: input => {
      const date = dayjs(input)
      if (!date.isValid()) return false
    },
    Boolean: input => typeof input === 'boolean',
    String: (input) => String.isString(input)
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
      throw new FlyValidateError('validate error', { errors })
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
    definetion = typeof definetion === 'object' ? definetion : { type: definetion }
    const type = definetion.type
    let value
    let valid = false

    if (definetion.before && typeof definetion.before === 'function') {
      input = definetion.before(input, definetion)
    }

    if (typeof input === 'undefined' && definetion.optional) {
      valid = true
      value = definetion.default
    } else if (this.validateMapper[type]) {
      if (String.isString(input) && definetion.pretrim) input = input.trim()
      const map = this.validateMapper[type]
      if (typeof map === 'function') {
        valid = map(input, definetion)
      } else if (Array.isArray(map)) {
        valid = Validator[map[0]](input, typeof map[1] === 'function' ? map[1](definetion) : map[1])
      } else if (String.isString(map)) {
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
