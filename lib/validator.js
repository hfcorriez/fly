const Validator = require('validator')
const dayjs = require('dayjs')
const PhoneNumber = require('awesome-phonenumber')

const { FlyValidateError } = require('./error')
const { logger } = require('./utils')

const debug = logger('❏validate', 'debug')

module.exports = {
  /**
   * Define mapper to process
   */
  validators: {
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
    macaddress: 'isMACAddress',
    mimetype: 'isMimeType',
    int: input => typeof input === 'number',
    number: input => typeof input === 'number' || Validator.isNumeric(input),
    port: 'isPort',
    url: 'isURL',
    lowercase: 'isLowercase',
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
    text: (input) => typeof input === 'string' && input.length > 0,
    pattern: (input, config) => config.pattern.test(input)
  },

  /**
   * prop config
   */
  props: {
    length: {
      for: ['string', 'array'],
      validator: (input, config) => {
        let min = -1
        let max = Infinity
        if (Array.isArray(config)) {
          min = config[0]
          max = config[1] || max
          return input.length >= min && input.length <= max
        } else if (typeof config === 'number') {
          return input.length === config
        }
        return true
      }
    },
    max: {
      for: ['number', 'string'],
      validator: (input, config) => {
        if (typeof config === 'string') {
          return input.length <= config
        } else {
          return input <= config
        }
      }
    },
    min: {
      for: ['number', 'string'],
      validator: (input, config) => {
        if (typeof config === 'string') {
          return input.length >= config
        } else {
          return input >= config
        }
      }
    }
  },

  systemTypes: {
    String: 'string',
    Number: 'int',
    Boolean: 'boolean',
    Array: 'array',
    Object: 'object',
    Date: 'date'
  },

  /**
   * Define transformers
   */
  transformers: {
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
      throw new FlyValidateError([...new Set(errors.map(e => `${e.message}${e.code ? ` [${e.code}]` : ''}`))].join(', '), { errors })
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
    debug('validate', input, definition, name)
    if (!definition) {
      return { value: input }
    }
    const path = name

    if (definition.array) {
      if (!Array.isArray(input)) {
        return { errors: [{ path, input, message: `${path} is not an array` }] }
      }
      const errors = []
      const value = []
      input.forEach((item, index) => {
        const { value: itemValue, errors: itemErrors } = this.validateOne(item, { ...definition, array: undefined }, `${name}[${index}]`)
        if (itemErrors) {
          errors.push(...itemErrors)
        } else {
          value.push(itemValue)
        }
      })
      return { value: errors ? undefined : value, errors }
    }

    if (definition.props) {
      try {
        const event = this.validateEvent(input, definition.props, name)
        return { value: event }
      } catch (e) {
        return { errors: e.errors }
      }
    }

    if (typeof definition === 'function' && this.systemTypes[definition.name]) {
      definition = { type: this.systemTypes[definition.name] }
    } if (typeof definition === 'function') {
      try {
        const ret = definition(input)
        if (typeof ret === 'object' && ret.hasOwnProperty('value')) {
          return ret
        }
        if (!ret) throw new Error('invalid return value')
        return { value: input }
      } catch (e) {
        return { errors: [{ path, input, type: 'custom', message: e.message }] }
      }
    } else if (definition instanceof RegExp || definition.type instanceof RegExp) {
      definition = { type: 'pattern', pattern: definition.type || definition }
    }

    definition = typeof definition === 'object' ? definition : { type: definition }

    let type = definition.type
    let message = definition.message || `${path} invalid ${type}`
    let code = definition.code
    let value
    let valid = false

    // Support use type interface
    if (!type && definition.pattern) {
      type = 'pattern'
    }

    if (typeof definition.pre === 'function') {
      input = definition.pre(input, definition)
    }

    if (typeof input === 'undefined') {
      if (!definition.required || definition.optional) {
        valid = true
        value = definition.default
      } else {
        return { errors: [{ path, input, type: 'nonexist', message, code }] }
      }
    } else if (this.validators[type]) {
      if (typeof input === 'string' && definition.trim) input = input.trim()
      const validateFn = this.validators[type]
      try {
        if (typeof validateFn === 'function') {
          valid = validateFn(input, definition)
        } else if (Array.isArray(validateFn)) {
          valid = Validator[validateFn[0]](input, typeof validateFn[1] === 'function' ? validateFn[1](definition) : validateFn[1])
        } else if (typeof validateFn === 'string') {
          valid = Validator[validateFn](input)
        }
      } catch (e) {
        return { errors: [{ path, input, type, message, code }] }
      }
      if (valid) value = input
    } else {
      valid = true
      value = input
    }

    // Process empty check
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

    // Process enum check
    if (valid && definition.enum && Array.isArray(definition.enum)) {
      valid = definition.enum.includes(value)
      if (!valid) type = 'enum'
    }

    // Process validate prop check
    for (const key in this.props) {
      if (!definition[key]) continue
      const propConfig = this.props[key]
      let valueType = typeof value
      if (valueType === 'object') {
        valueType = Array.isArray(value) ? 'array' : 'object'
      }
      if (propConfig.for.includes(valueType)) {
        const validator = propConfig.validator
        valid = validator(value, definition[key])
        if (!valid) {
          type = key
          break
        }
      }
    }

    // return erros for invalid
    if (!valid) {
      return { errors: [{ path, input, type, message, code }] }
    }

    // Support after as function to define custom transformer
    if (typeof value !== 'undefined' && valid && this.transformers[type]) {
      const transformer = this.transformers[type]
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
