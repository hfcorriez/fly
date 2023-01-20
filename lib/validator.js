const dayjs = require('dayjs')
const { logger } = require('./utils')
const debug = logger('▶validator', 'debug')
const error = logger('▶validator', 'error')

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
  /**
   * Define mapper to process
   */
  validators: {
    email: /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    phone: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im,
    alpha: /^[A-Za-z]+$/,
    base32: /^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$/,
    base64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    hexcolor: /^#(?:[0-9a-fA-F]{3}){1,2}$/,
    hex: /^[0-9A-Fa-f]+$/g,
    ip: /^((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))$/,
    json: input => {
      try {
        JSON.parse(input)
        return true
      } catch (err) {
        return false
      }
    },
    jwt: /^[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*$/,
    macaddress: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
    mimetype: /^[-\w.]+\/[-+\w.]+$/,
    number: input => typeof input === 'number',
    numeric: input => typeof input === 'number' || /^\d+$/.test(input),
    port: input => typeof input === 'number' && input >= 0 && input <= 65535,
    url: /^([a-z]([a-z]|\d|\+|-|\.)*):(\/\/(((([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:)*@)?((\[(|(v[\da-f]{1,}\.(([a-z]|\d|-|\.|_|~)|[!$&'()*+,;=]|:)+))\])|((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|(([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=])*)(:\d*)?)(\/(([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)*)*|(\/((([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)*)*)?)|((([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)*)*)|((([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)){0})(\?((([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)|[\xE000-\xF8FF]|\/|\?)*)?(#((([a-z]|\d|-|\.|_|~|[\x00A0-\xD7FF\xF900-\xFDCF\xFDF0-\xFFEF])|(%[\da-f]{2})|[!$&'()*+,;=]|:|@)|\/|\?)*)?$/i,
    alphanumeric: /^[a-zA-Z0-9_]*$/,
    locale: /^[A-Za-z]{2,4}([_-]([A-Za-z]{4}|[\d]{3}))?([_-]([A-Za-z]{2}|[\d]{3}))?$/,
    fqdn: /^(?!:\/\/)([a-zA-Z0-9]+\.)?[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,6}?$/i,
    ascii: /^[\x00-\x7F]+$/,
    md5: input => /[a-fA-F0-9]{32}/.test(input),
    float: input => Number(input) === input && input % 1 !== 0,
    object: input => typeof input === 'object',
    objectid: input => /^[0-9a-fA-F]{24}$/.test(String(input)),
    nonempty: input => !!input,
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
    Number: 'number',
    Boolean: 'boolean',
    Array: 'array',
    Object: 'object',
    Date: 'date'
  },

  /**
   * Define transformers
   */
  transformers: {
    numeric: (value, definition) => {
      switch (definition.format) {
        case 'number':
          return parseInt(value)
        case 'float':
          return parseFloat(value)
        default:
          return value
      }
    },
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

    debug('validate start', event, props, name)

    const all = props.$all === true

    for (const key in props) {
      const path = name ? `${name}.${key}` : key
      const { value, errors: keyErrors } = this.validateOne(event[key], props[key], path, all)
      if (keyErrors) {
        errors.push(...keyErrors)
        if (!all) break
      } else if (value !== event[key]) {
        event[key] = value
      }
    }

    if (errors.length) {
      error(`validate failed: ${name} - ${errors.map(e => `${e.path}(${e.type})`).join(',')}`)
      throw new FlyValidateError([
        ...new Set(errors.map(e => `${e.message}${e.code ? ` [${e.code}]` : ''}`))].join(', ')
      , {
        ...errors[0],
        errors
      })
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
  validateOne (input, definition, name, $all) {
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
        const { value: itemValue, errors: itemErrors } = this.validateOne(item, { ...definition, array: undefined }, `${name}[${index}]`, $all)
        if (itemErrors) {
          errors.push(...itemErrors)
        } else {
          value.push(itemValue)
        }
      })
      return { path, value: errors ? undefined : value, errors }
    }

    if (definition.props && typeof definition.props === 'object') {
      try {
        const event = this.validateEvent(input, { ...definition.props, $all }, name)
        return { path, value: event }
      } catch (e) {
        return { errors: e.errors }
      }
    }

    if (typeof definition === 'function' || typeof definition === 'string') {
      definition = { type: definition }
    }

    if (typeof definition.type === 'function' && this.systemTypes[definition.type.name]) {
      definition.type = this.systemTypes[definition.type.name]
    } if (typeof definition === 'function') {
      try {
        const ret = definition(input)
        if (typeof ret === 'object' && ret.hasOwnProperty('value')) {
          return ret
        }
        if (!ret) throw new Error('invalid return value')
        return { path, value: input }
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

    if (definition.pre) {
      input = this.format(definition.pre, value)
    }

    if (typeof input === 'undefined') {
      if (definition.optional || definition.default || definition.required === false) {
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
        } else if (validateFn instanceof RegExp) {
          valid = validateFn.test(input)
        }
      } catch (e) {
        return { errors: [{ path, input, type, message, code }] }
      }
      if (valid) value = input
    } else {
      valid = true
      value = input
    }

    debug('validate one', path, input, definition, valid, value)

    // Process empty check
    if (valid && !definition.empty) {
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

    // Process enum check
    if (definition.enum && Array.isArray(definition.enum)) {
      valid = definition.enum.includes(value)
      if (!valid) {
        return { errors: [{ path, input, type: 'enum', message, code }] }
      }
    }

    /**
     * Post process
     */

    // Support after as function to define custom transformer
    if (typeof value !== 'undefined' && valid && this.transformers[type]) {
      const transformer = this.transformers[type]
      value = transformer(value, definition)
    }

    // Post format
    if (definition.format) {
      value = this.format(definition.format, value)
    }

    return { value }
  },

  /**
   * Process format
   *
   * @param {Mixed} handler
   * @param {Mixed} value
   * @returns
   */
  format (handler, value) {
    const handlers = Array.isArray(handler) ? handler : [handler]
    for (const handle of handlers) {
      switch (handle) {
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
          if (typeof handle === 'function') {
            value = handle(value)
          }
      }
    }
    return value
  }
}
