const MAGS = 'BKMGTPEZY'
const wcwidth = require('wcwidth')
// const colors = require('colors/safe')
const debug = require('debug')

const DEBUG_COLORS = { fatal: 1, error: 9, warn: 3, info: 4, debug: 8 }

exports.FN_EXEC_BEFORE = ['before', 'props', 'validate', 'main']
exports.FN_EXEC_AFTER = ['after']
exports.FN_RESERVE_KEYS = exports.FN_EXEC_BEFORE.concat(exports.FN_EXEC_AFTER).concat(['config', 'catch'])
exports.FN_RESERVE_REGEX = new RegExp(`^(${exports.FN_RESERVE_KEYS.join('|')})([a-zA-Z]+)`)
exports.CTX_RESERVED_KEYS = ['eventId', 'eventType', 'parentEvent', 'originalEvent', 'fly', 'log', '_init']

exports.humansize = function humansize (bytes, precision) {
  let magnitude = Math.min(Math.log(bytes) / Math.log(1024) | 0, MAGS.length - 1)
  let result = bytes / Math.pow(1024, magnitude)
  let suffix = MAGS[magnitude].trim() + 'B'
  return result.toFixed(precision) + suffix
}

exports.name = function (filePath) {
  return filePath
    .replace(/\//g, '.')
    .replace(/\.js$/, '')
    .replace(/[-_]([a-z])/g, (_, word) => word.toUpperCase())
}

exports.logger = function (namespace, program, level) {
  const color = DEBUG_COLORS[level]
  const logger = debug(`<${namespace}:${program}> [${level}]`)
  logger.color = color || 6
  return logger
}

exports.padding = function (text, length, options) {
  let escapecolor, invert, pad, padlength, textnocolors

  if (options == null) {
    options = {}
  }
  invert = typeof text === 'number'
  if (invert) {
    [length, text] = [text, length]
  }
  if (typeof options === 'string') {
    options = {
      char: options
    }
  }
  if (options.char == null) {
    options.char = ' '
  }
  if (options.strip == null) {
    options.strip = false
  }
  if (typeof text !== 'string') {
    text = String(text)
  }
  textnocolors = null
  pad = ''
  if (options.colors) {
    escapecolor = /\x1B\[(?:[0-9]{1,2}(?:;[0-9]{1,2})?)?[m|K]/g
    textnocolors = text.replace(escapecolor, '')
  }
  padlength = options.fixed_width ? length - (textnocolors || text).length : length - wcwidth(textnocolors || text, options.wcwidth_options)
  if (padlength < 0) {
    if (options.strip) {
      if (invert) {
        return text.substr(length * -1)
      } else {
        return text.substr(0, length)
      }
    }
    return text
  }
  pad += options.char.repeat(padlength)
  if (invert) {
    return pad + text
  } else {
    return text + pad
  }
}

exports.invert = function (obj) {
  let ret = {}
  for (let key in obj) ret[obj[key]] = key
  return ret
}

exports.ucfirst = function (string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

exports.stringify = function (data) {
  return JSON.stringify(data).replace(/"([^(")"]+)":/g, '$1:')
}

exports.randomInt = function (max) {
  return Math.floor(Math.random() * max)
}
