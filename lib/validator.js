const Validator = require('validator')
const dayjs = require('dayjs')
const PhoneNumber = require('awesome-phonenumber')

const { FlyValidateError } = require('./error')
const TYPE_NAMES = [Date, Number, Boolean, Array, Object, String]

module.exports = {
  /**
   * Define mapper to process
   */
  validateMapper: {
    email: 'isEmail',
    phone: input => PhoneNumber(input).isValid(),
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
    int: input => typeof input === 'number',
    number: input => typeof input === 'number' || Validator.isNumeric(input),
    port: 'isPort',
    url: 'isURL',
    uppercase: 'isUppercase',
    alphanumeric: 'isAlphanumeric',
    locale: 'isLocale',
    fqdn: 'isFQDN',
    ascii: 'isASCII',
    md5: input => /[a-fA-F0-9]{32}/.test(input),
    float: input => Number(input) === input && input % 1 !== 0,
    object: input => typeof input === 'object',
    array: input => Array.isArray(input),
    date: input => dayjs(input).isValid(),
    boolean: input => typeof input === 'boolean',
    bool: input => typeof input === 'boolean',
    string: (input) => typeof input === 'string',
    text: (input) => typeof input === 'string' && input.length > 0
  },

  /**
   * Define transformers
   */
  validateTransformer: {
    number: (value, definition) => {
      switch (definition.format) {
        case 'int':
          return parseInt(value)
        case 'float':
          return parseFloat(value)
        default:
          return value
      }
    },
    phone: value => PhoneNumber(value).getNumber(),
    date: (value, definition) => {
      switch (definition.format) {
        case 'date':
          return dayjs(value).foramt('YYYY-MM-DD')
        case 'datetime':
          return dayjs(value).foramt('YYYY-MM-DD HH:mm:ss')
        case 'iso':
          return dayjs(value).format()
        case 'timestamp':
        case 'seconds':
        case 's':
          return dayjs(value).unix()
        case 'milliseconds':
        case 'ms':
          return dayjs(value).valueOf()
        default:
          return dayjs(definition.format)
      }
    }
  },

  /**
   * Validate event
   */
  validateEvent (event, props, name) {
    const errors = []

    Object.keys(props).forEach(key => {
      const path = name ? `${name}.${key}` : key
      const { value, errors: keyErrors } = this.validateOne(event[key], props[key], path)
      if (keyErrors) {
        errors.push(...keyErrors)
      } else if (value !== event[key]) {
        event[key] = value
      }
    })

    if (errors.length) {
      throw new FlyValidateError(`validate failed ${errors.map(e => `${e.path}(${e.type})`).join(', ')}`, { errors })
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
  validateOne (input, definition, name) {
    if (!definition) {
      return { value: input }
    }
    const path = name

    if (definition.props) {
      try {
        const event = this.validateEvent(input, definition.props, name)
        return { value: event }
      } catch (e) {
        return { errors: e.errors }
      }
    }

    if (typeof definition === 'function') {
      try {
        const ret = definition(input)
        if (typeof ret === 'object' && ret.hasOwnProperty('valid')) {
          return ret
        }
        return { value: input }
      } catch (e) {
        return { errors: [{ path, input }] }
      }
    } else if (definition instanceof RegExp) {
      const ret = typeof inptu === 'string' ? definition.test(input) : false
      if (!ret) {
        return { errors: [{ path, input, type: 'pattern' }] }
      }
      return { value: input }
    }

    definition = typeof definition === 'object' ? definition : { type: definition, required: true }

    let type = definition.type
    let value
    let valid = false

    // Support use type interface
    if (TYPE_NAMES.includes(type)) {
      type = type.toString().match(/ ([a-zA-Z]+)\(/)[1].toLowerCase()
    }

    if (typeof definition.pre === 'function') {
      input = definition.pre(input, definition)
    }

    if (typeof input === 'undefined') {
      if (!definition.required || definition.optional) {
        valid = true
        value = definition.default
      } else {
        return { errors: [{ path, input, type: 'undefined' }] }
      }
    } else if (this.validateMapper[type]) {
      if (typeof input === 'string' && definition.trim) input = input.trim()
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

    if (valid && definition.empty === false) {
      switch (typeof value) {
        case 'string':
        case 'array':
          valid = value.length > 0
          break
        case 'object':
          valid = Object.keys(value).length > 0
          break
      }
      if (!valid) type = 'empty'
    }

    // Enum check
    if (valid && definition.enum && Array.isArray(definition.enum)) {
      valid = definition.enum.includes(value)
      if (!valid) type = 'enum'
    }

    // return erros for invalid
    if (!valid) {
      return { errors: [{ path, input, type }] }
    }

    // Support after as function to define custom transformer
    if (typeof value !== 'undefined' && valid && this.validateTransformer[type]) {
      const transformer = this.validateTransformer[type]
      value = transformer(value, definition)
    } else if (value && definition.format) {
      // Support after as function to define custom transformer
      const formats = Array.isArray(definition.format) ? definition.format : [definition.format]
      for (const format of formats) {
        switch (definition.format) {
          case 'uppercase':
            if (typeof value === 'string') {
              value = value.toUpperCase()
            }
            break
          case 'lowercase':
            if (typeof value === 'string') {
              value = value.toLowerCase()
            }
            break
          case 'trim':
            if (typeof value === 'string') {
              value = value.trim()
            }
            break
          default:
            if (typeof format === 'function') {
              value = format(value)
            }
        }
      }
    }

    return { value }
  }
}
