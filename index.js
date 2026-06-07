/*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
/* eslint-disable node/no-deprecated-api, no-var */
var buffer = require('buffer')
var Buffer = buffer.Buffer

if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Legacy path: polyfill for old Node.js versions (< 5.10.0)
  // Some modern methods may be partially available (e.g., Node 4.5.0 has Buffer.from
  // but not Buffer.allocUnsafeSlow). Check individually and cache the results.
  var hasFrom = typeof Buffer.from === 'function'
  var hasAllocUnsafe = typeof Buffer.allocUnsafe === 'function'
  var hasAllocUnsafeSlow = typeof Buffer.allocUnsafeSlow === 'function'

  // Use Object.assign if available for faster property copying
  var copyProps = Object.assign || function copyProps (src, dst) {
    for (var key in src) {
      dst[key] = src[key]
    }
  }

  // Copy properties from require('buffer') to exports
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer

  function SafeBuffer (arg, encodingOrOffset, length) {
    if (typeof arg === 'number') {
      var buf = hasAllocUnsafe ? Buffer.allocUnsafe(arg) : Buffer(arg)
      buf.fill(0)
      return buf
    }
    return hasFrom
      ? Buffer.from(arg, encodingOrOffset, length)
      : Buffer(arg, encodingOrOffset, length)
  }

  SafeBuffer.prototype = Object.create(Buffer.prototype)

  // Copy static methods from Buffer
  copyProps(Buffer, SafeBuffer)

  SafeBuffer.from = function (arg, encodingOrOffset, length) {
    if (typeof arg === 'number') {
      throw new TypeError('Argument must not be a number')
    }
    return hasFrom
      ? Buffer.from(arg, encodingOrOffset, length)
      : Buffer(arg, encodingOrOffset, length)
  }

  SafeBuffer.alloc = function (size, fill, encoding) {
    if (typeof size !== 'number') {
      throw new TypeError('Argument must be a number')
    }
    var buf = hasAllocUnsafe ? Buffer.allocUnsafe(size) : Buffer(size)
    buf.fill(fill || 0, encoding)
    return buf
  }

  SafeBuffer.allocUnsafe = function (size) {
    if (typeof size !== 'number') {
      throw new TypeError('Argument must be a number')
    }
    return hasAllocUnsafe ? Buffer.allocUnsafe(size) : Buffer(size)
  }

  SafeBuffer.allocUnsafeSlow = function (size) {
    if (typeof size !== 'number') {
      throw new TypeError('Argument must be a number')
    }
    return hasAllocUnsafeSlow ? Buffer.allocUnsafeSlow(size) : buffer.SlowBuffer(size)
  }
}
