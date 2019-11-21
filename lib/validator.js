const Validator = require('validator')
const dayjs = require('dayjs')

const { FlyValidateError } = require('./error')

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
    String: (input) => typeof input === 'string'
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
    definetion = typeof definetion === 'object' ? definetion : { type: definetion }
    const type = definetion.type
    let value
    let valid = false

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
