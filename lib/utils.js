const MAGS = 'BKMGTPEZY'
const wcwidth = require('wcwidth')

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;

exports.humansize = function humansize(bytes, precision) {
  let magnitude = Math.min(Math.log(bytes) / Math.log(1024) | 0, MAGS.length - 1)
  let result = bytes / Math.pow(1024, magnitude)
  let suffix = MAGS[magnitude].trim() + 'B'
  return result.toFixed(precision) + suffix
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

exports.getFunctionParams = function (func) {
  let str = func.toString().replace(STRIP_COMMENTS, '')
  let result = str.slice(str.indexOf('(') + 1, str.indexOf(')')).match(ARGUMENT_NAMES)
  return result || []
}
