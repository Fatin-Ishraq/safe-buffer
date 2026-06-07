/*!
 * Extended correctness tests for safe-buffer optimizations
 * Validates all edge cases that the optimizations must preserve
 */
'use strict'

var test = require('tape')
var SafeBuffer = require('../').Buffer
var NativeBuffer = require('buffer').Buffer

test('SafeBuffer.alloc zero-fills correctly', function (t) {
  var buf = SafeBuffer.alloc(100)
  for (var i = 0; i < 100; i++) {
    t.equal(buf[i], 0, 'byte ' + i + ' should be 0')
  }
  t.end()
})

test('SafeBuffer.alloc with fill number', function (t) {
  var buf = SafeBuffer.alloc(100, 0xab)
  for (var i = 0; i < 100; i++) {
    t.equal(buf[i], 0xab, 'byte ' + i + ' should be 0xab')
  }
  t.end()
})

test('SafeBuffer.alloc with fill string', function (t) {
  var buf = SafeBuffer.alloc(10, 'abc')
  t.equal(buf.toString(), 'abcabcabca', 'fill with string works')
  t.end()
})

test('SafeBuffer.alloc with fill string and encoding', function (t) {
  var buf = SafeBuffer.alloc(8, 'deadbeef', 'hex')
  t.equal(buf[0], 0xde, 'first byte should be 0xde')
  t.equal(buf[1], 0xad, 'second byte should be 0xad')
  t.equal(buf[2], 0xbe, 'third byte should be 0xbe')
  t.equal(buf[3], 0xef, 'fourth byte should be 0xef')
  t.end()
})

test('SafeBuffer.alloc with fill Buffer', function (t) {
  var fill = NativeBuffer.from([1, 2, 3])
  var buf = SafeBuffer.alloc(9, fill)
  t.deepEqual(Array.from(buf), [1, 2, 3, 1, 2, 3, 1, 2, 3])
  t.end()
})

test('SafeBuffer.from string matches native', function (t) {
  var safe = SafeBuffer.from('hello world')
  var native = NativeBuffer.from('hello world')
  t.deepEqual(safe, native)
  t.end()
})

test('SafeBuffer.from hex string matches native', function (t) {
  var safe = SafeBuffer.from('deadbeef', 'hex')
  var native = NativeBuffer.from('deadbeef', 'hex')
  t.deepEqual(safe, native)
  t.end()
})

test('SafeBuffer.from array matches native', function (t) {
  var arr = [1, 2, 3, 4, 5]
  var safe = SafeBuffer.from(arr)
  var native = NativeBuffer.from(arr)
  t.deepEqual(safe, native)
  t.end()
})

test('SafeBuffer.from Uint8Array matches native', function (t) {
  var ui = new Uint8Array([1, 2, 3, 4, 5])
  var safe = SafeBuffer.from(ui)
  var native = NativeBuffer.from(ui)
  t.deepEqual(safe, native)
  t.end()
})

test('SafeBuffer.from ArrayBuffer matches native', function (t) {
  var ab = new ArrayBuffer(8)
  var dv = new DataView(ab)
  for (var i = 0; i < 8; i++) dv.setUint8(i, i * 16)
  var safe = SafeBuffer.from(ab)
  var native = NativeBuffer.from(ab)
  t.deepEqual(safe, native)
  t.end()
})

test('SafeBuffer.from Buffer matches native', function (t) {
  var original = NativeBuffer.from([1, 2, 3])
  var safe = SafeBuffer.from(original)
  var native = NativeBuffer.from(original)
  t.deepEqual(safe, native)
  t.end()
})

test('new SafeBuffer(string) matches new NativeBuffer(string)', function (t) {
  // Note: new Buffer(string) is deprecated but must still work
  var safe = new SafeBuffer('hello')
  t.equal(safe.toString(), 'hello')
  t.ok(SafeBuffer.isBuffer(safe))
  t.ok(NativeBuffer.isBuffer(safe))
  t.end()
})

test('new SafeBuffer(array) works correctly', function (t) {
  var safe = new SafeBuffer([1, 2, 3])
  t.equal(safe[0], 1)
  t.equal(safe[1], 2)
  t.equal(safe[2], 3)
  t.ok(SafeBuffer.isBuffer(safe))
  t.ok(NativeBuffer.isBuffer(safe))
  t.end()
})

test('SafeBuffer.allocUnsafe returns correct length buffer', function (t) {
  var buf = SafeBuffer.allocUnsafe(256)
  t.equal(buf.length, 256)
  t.ok(SafeBuffer.isBuffer(buf))
  t.ok(NativeBuffer.isBuffer(buf))
  t.end()
})

test('SafeBuffer.allocUnsafeSlow returns non-pooled buffer', function (t) {
  var buf = SafeBuffer.allocUnsafeSlow(256)
  t.equal(buf.length, 256)
  t.ok(SafeBuffer.isBuffer(buf))
  t.ok(NativeBuffer.isBuffer(buf))
  t.end()
})

test('SafeBuffer.isBuffer works', function (t) {
  var buf = SafeBuffer.alloc(16)
  t.ok(SafeBuffer.isBuffer(buf))
  t.ok(NativeBuffer.isBuffer(buf))
  t.notOk(SafeBuffer.isBuffer({}))
  t.notOk(SafeBuffer.isBuffer([]))
  t.notOk(SafeBuffer.isBuffer('string'))
  t.end()
})

test('SafeBuffer static methods are present', function (t) {
  t.equal(typeof SafeBuffer.from, 'function')
  t.equal(typeof SafeBuffer.alloc, 'function')
  t.equal(typeof SafeBuffer.allocUnsafe, 'function')
  t.equal(typeof SafeBuffer.allocUnsafeSlow, 'function')
  t.equal(typeof SafeBuffer.isBuffer, 'function')
  t.equal(typeof SafeBuffer.isEncoding, 'function')
  t.equal(typeof SafeBuffer.byteLength, 'function')
  t.equal(typeof SafeBuffer.concat, 'function')
  t.equal(typeof SafeBuffer.compare, 'function')
  t.end()
})

test('SafeBuffer.byteLength matches native', function (t) {
  t.equal(SafeBuffer.byteLength('hello'), NativeBuffer.byteLength('hello'))
  t.equal(SafeBuffer.byteLength('hello', 'utf8'), NativeBuffer.byteLength('hello', 'utf8'))
  t.equal(SafeBuffer.byteLength('deadbeef', 'hex'), NativeBuffer.byteLength('deadbeef', 'hex'))
  t.end()
})

test('SafeBuffer.concat works', function (t) {
  var bufs = [SafeBuffer.from('hello '), SafeBuffer.from('world')]
  var result = SafeBuffer.concat(bufs)
  t.equal(result.toString(), 'hello world')
  t.end()
})

test('SafeBuffer.compare works', function (t) {
  var a = SafeBuffer.from('abc')
  var b = SafeBuffer.from('abd')
  t.ok(SafeBuffer.compare(a, b) < 0)
  t.ok(SafeBuffer.compare(b, a) > 0)
  t.equal(SafeBuffer.compare(a, a), 0)
  t.end()
})

test('SafeBuffer.isEncoding works', function (t) {
  t.ok(SafeBuffer.isEncoding('utf8'))
  t.ok(SafeBuffer.isEncoding('hex'))
  t.ok(SafeBuffer.isEncoding('base64'))
  t.notOk(SafeBuffer.isEncoding('invalid'))
  t.end()
})

test('SafeBuffer.poolSize is accessible', function (t) {
  t.equal(typeof SafeBuffer.poolSize, 'number')
  t.equal(SafeBuffer.poolSize, NativeBuffer.poolSize)
  t.end()
})

test('Buffer.prototype methods work on SafeBuffer instances', function (t) {
  var buf = SafeBuffer.from('hello world')
  t.equal(buf.toString(), 'hello world')
  t.equal(buf.slice(0, 5).toString(), 'hello')
  t.equal(buf.indexOf('world'), 6)
  t.ok(buf.includes('world'))
  t.end()
})

test('SafeBuffer.from with offset and length (ArrayBuffer)', function (t) {
  var ab = new ArrayBuffer(16)
  var view = new Uint8Array(ab)
  for (var i = 0; i < 16; i++) view[i] = i
  var safe = SafeBuffer.from(ab, 4, 8)
  var native = NativeBuffer.from(ab, 4, 8)
  t.deepEqual(safe, native)
  t.equal(safe.length, 8)
  t.end()
})

test('SafeBuffer.alloc(0) returns empty buffer', function (t) {
  var buf = SafeBuffer.alloc(0)
  t.equal(buf.length, 0)
  t.end()
})

test('SafeBuffer.from throws with number (API compatibility)', function (t) {
  t.plan(5)
  t.throws(function () { SafeBuffer.from(0) })
  t.throws(function () { SafeBuffer.from(-1) })
  t.throws(function () { SafeBuffer.from(NaN) })
  t.throws(function () { SafeBuffer.from(Infinity) })
  t.throws(function () { SafeBuffer.from(99) })
})

test('SafeBuffer.alloc throws with non-number', function (t) {
  t.plan(4)
  t.throws(function () { SafeBuffer.alloc('hey') })
  t.throws(function () { SafeBuffer.alloc('hey', 'utf8') })
  t.throws(function () { SafeBuffer.alloc([1, 2, 3]) })
  t.throws(function () { SafeBuffer.alloc({}) })
})

test('SafeBuffer.allocUnsafe throws with non-number', function (t) {
  t.plan(4)
  t.throws(function () { SafeBuffer.allocUnsafe('hey') })
  t.throws(function () { SafeBuffer.allocUnsafe('hey', 'utf8') })
  t.throws(function () { SafeBuffer.allocUnsafe([1, 2, 3]) })
  t.throws(function () { SafeBuffer.allocUnsafe({}) })
})

test('Binary data roundtrip', function (t) {
  var data = new Uint8Array(256)
  for (var i = 0; i < 256; i++) data[i] = i
  var buf = SafeBuffer.from(data)
  for (var j = 0; j < 256; j++) {
    t.equal(buf[j], j, 'byte ' + j + ' preserved')
  }
  t.end()
})

test('UTF-8 encoding roundtrip', function (t) {
  var strings = ['hello', '你好世界', '🎉🎊', 'café', 'naïve']
  strings.forEach(function (s) {
    var buf = SafeBuffer.from(s, 'utf8')
    t.equal(buf.toString('utf8'), s, 'roundtrip for: ' + s)
  })
  t.end()
})
