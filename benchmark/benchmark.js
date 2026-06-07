/*!
 * safe-buffer benchmark suite
 * Measures: allocation speed, string→buffer, array→buffer, tight loops
 */
'use strict'

var path = require('path')
var fs = require('fs')

// Helper: high-resolution timer
function clock () {
  var t = process.hrtime()
  return t[0] * 1e9 + t[1]
}

// Helper: format nanoseconds
function fmtNs (ns) {
  if (ns >= 1e9) return (ns / 1e9).toFixed(3) + ' s'
  if (ns >= 1e6) return (ns / 1e6).toFixed(3) + ' ms'
  if (ns >= 1e3) return (ns / 1e3).toFixed(3) + ' us'
  return ns.toFixed(0) + ' ns'
}

// Helper: ops/sec
function opsPerSec (ns, iterations) {
  return (iterations / (ns / 1e9)).toFixed(0)
}

// Warmup runs
var WARMUP = 3
// Measured runs
var RUNS = 10

function runBench (name, fn, iterations) {
  // Warmup
  for (var w = 0; w < WARMUP; w++) {
    fn(iterations)
  }

  var times = []
  for (var r = 0; r < RUNS; r++) {
    var start = clock()
    fn(iterations)
    var end = clock()
    times.push(end - start)
  }

  // Compute statistics
  var totalNs = times.reduce(function (a, b) { return a + b }, 0)
  var avgNs = totalNs / RUNS
  var minNs = Math.min.apply(null, times)
  var maxNs = Math.max.apply(null, times)
  var sorted = times.slice().sort(function (a, b) { return a - b })
  var medianNs = sorted[Math.floor(sorted.length / 2)]
  var perOpNs = avgNs / iterations

  return {
    name: name,
    iterations: iterations,
    totalAvg: fmtNs(avgNs),
    min: fmtNs(minNs),
    max: fmtNs(maxNs),
    median: fmtNs(medianNs),
    perOp: fmtNs(perOpNs),
    opsPerSec: opsPerSec(avgNs, iterations),
    avgNsRaw: avgNs,
    minNsRaw: minNs,
    medianNsRaw: medianNs,
    perOpNsRaw: perOpNs
  }
}

// ============================
// BENCHMARK SUITE
// ============================

var results = []

function suite (label, modulePath) {
  var SafeBuffer = require(modulePath)
  var Buffer = SafeBuffer.Buffer

  console.log('\n=== ' + label + ' ===\n')

  var testString = 'Hello, World! This is a test string for buffer conversion benchmarks.'
  var testArray = []
  for (var i = 0; i < 256; i++) testArray.push(i & 0xff)
  var hexString = 'deadbeef' + 'cafebabe'.repeat(31) // 256 chars = 128 bytes

  // ---- 1. Buffer.alloc - small (16 bytes) ----
  var r1 = runBench('Buffer.alloc small (16B)', function (n) {
    for (var i = 0; i < n; i++) Buffer.alloc(16)
  }, 1000000)
  results.push(Object.assign({ suite: label }, r1))
  console.log('  ' + r1.name + ': ' + r1.perOp + '/op  (' + r1.opsPerSec + ' ops/s)  median: ' + r1.median)

  // ---- 2. Buffer.alloc - medium (4096 bytes) ----
  var r2 = runBench('Buffer.alloc medium (4KB)', function (n) {
    for (var i = 0; i < n; i++) Buffer.alloc(4096)
  }, 500000)
  results.push(Object.assign({ suite: label }, r2))
  console.log('  ' + r2.name + ': ' + r2.perOp + '/op  (' + r2.opsPerSec + ' ops/s)  median: ' + r2.median)

  // ---- 3. Buffer.alloc - large (1MB) ----
  var r3 = runBench('Buffer.alloc large (1MB)', function (n) {
    for (var i = 0; i < n; i++) Buffer.alloc(1048576)
  }, 10000)
  results.push(Object.assign({ suite: label }, r3))
  console.log('  ' + r3.name + ': ' + r3.perOp + '/op  (' + r3.opsPerSec + ' ops/s)  median: ' + r3.median)

  // ---- 4. Buffer.allocUnsafe - small ----
  var r4 = runBench('Buffer.allocUnsafe small (16B)', function (n) {
    for (var i = 0; i < n; i++) Buffer.allocUnsafe(16)
  }, 1000000)
  results.push(Object.assign({ suite: label }, r4))
  console.log('  ' + r4.name + ': ' + r4.perOp + '/op  (' + r4.opsPerSec + ' ops/s)  median: ' + r4.median)

  // ---- 5. Buffer.allocUnsafe - medium ----
  var r5 = runBench('Buffer.allocUnsafe medium (4KB)', function (n) {
    for (var i = 0; i < n; i++) Buffer.allocUnsafe(4096)
  }, 500000)
  results.push(Object.assign({ suite: label }, r5))
  console.log('  ' + r5.name + ': ' + r5.perOp + '/op  (' + r5.opsPerSec + ' ops/s)  median: ' + r5.median)

  // ---- 6. Buffer.from string (utf8) ----
  var r6 = runBench('Buffer.from string (utf8)', function (n) {
    for (var i = 0; i < n; i++) Buffer.from(testString)
  }, 1000000)
  results.push(Object.assign({ suite: label }, r6))
  console.log('  ' + r6.name + ': ' + r6.perOp + '/op  (' + r6.opsPerSec + ' ops/s)  median: ' + r6.median)

  // ---- 7. Buffer.from string (hex) ----
  var r7 = runBench('Buffer.from string (hex)', function (n) {
    for (var i = 0; i < n; i++) Buffer.from(hexString, 'hex')
  }, 500000)
  results.push(Object.assign({ suite: label }, r7))
  console.log('  ' + r7.name + ': ' + r7.perOp + '/op  (' + r7.opsPerSec + ' ops/s)  median: ' + r7.median)

  // ---- 8. Buffer.from array ----
  var r8 = runBench('Buffer.from array', function (n) {
    for (var i = 0; i < n; i++) Buffer.from(testArray)
  }, 500000)
  results.push(Object.assign({ suite: label }, r8))
  console.log('  ' + r8.name + ': ' + r8.perOp + '/op  (' + r8.opsPerSec + ' ops/s)  median: ' + r8.median)

  // ---- 9. Buffer.from Uint8Array ----
  var uint8 = new Uint8Array(testArray)
  var r9 = runBench('Buffer.from Uint8Array', function (n) {
    for (var i = 0; i < n; i++) Buffer.from(uint8)
  }, 500000)
  results.push(Object.assign({ suite: label }, r9))
  console.log('  ' + r9.name + ': ' + r9.perOp + '/op  (' + r9.opsPerSec + ' ops/s)  median: ' + r9.median)

  // ---- 10. Tight loop alloc+fill (realistic workload) ----
  var r10 = runBench('Buffer.alloc + fill pattern', function (n) {
    for (var i = 0; i < n; i++) {
      var buf = Buffer.alloc(256)
      buf.fill(0xab)
    }
  }, 500000)
  results.push(Object.assign({ suite: label }, r10))
  console.log('  ' + r10.name + ': ' + r10.perOp + '/op  (' + r10.opsPerSec + ' ops/s)  median: ' + r10.median)

  // ---- 11. new SafeBuffer constructor (string) ----
  var r11 = runBench('new SafeBuffer(string)', function (n) {
    for (var i = 0; i < n; i++) new Buffer(testString) // eslint-disable-line
  }, 1000000)
  results.push(Object.assign({ suite: label }, r11))
  console.log('  ' + r11.name + ': ' + r11.perOp + '/op  (' + r11.opsPerSec + ' ops/s)  median: ' + r11.median)

  // ---- 12. new SafeBuffer constructor (array) ----
  var r12 = runBench('new SafeBuffer(array)', function (n) {
    for (var i = 0; i < n; i++) new Buffer(testArray) // eslint-disable-line
  }, 500000)
  results.push(Object.assign({ suite: label }, r12))
  console.log('  ' + r12.name + ': ' + r12.perOp + '/op  (' + r12.opsPerSec + ' ops/s)  median: ' + r12.median)

  // ---- 13. Module require() overhead ----
  // Clear require cache for this module
  var modKey = require.resolve(modulePath)
  delete require.cache[modKey]
  var r13 = runBench('Module require() overhead', function (n) {
    for (var i = 0; i < n; i++) {
      delete require.cache[modKey]
      require(modulePath)
    }
  }, 1000)
  results.push(Object.assign({ suite: label }, r13))
  console.log('  ' + r13.name + ': ' + r13.perOp + '/op  (' + r13.opsPerSec + ' ops/s)  median: ' + r13.median)

  // ---- 14. Buffer.allocUnsafeSlow ----
  var r14 = runBench('Buffer.allocUnsafeSlow (4KB)', function (n) {
    for (var i = 0; i < n; i++) Buffer.allocUnsafeSlow(4096)
  }, 100000)
  results.push(Object.assign({ suite: label }, r14))
  console.log('  ' + r14.name + ': ' + r14.perOp + '/op  (' + r14.opsPerSec + ' ops/s)  median: ' + r14.median)

  // ---- 15. Buffer.alloc with fill value ----
  var r15 = runBench('Buffer.alloc with fill (0xab)', function (n) {
    for (var i = 0; i < n; i++) Buffer.alloc(256, 0xab)
  }, 500000)
  results.push(Object.assign({ suite: label }, r15))
  console.log('  ' + r15.name + ': ' + r15.perOp + '/op  (' + r15.opsPerSec + ' ops/s)  median: ' + r15.median)
}

// Run baseline
suite('Baseline', path.resolve(__dirname, '..', 'index.js'))

// Save results as JSON
var outputPath = path.resolve(__dirname, '..', 'benchmark_results.json')
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
console.log('\nResults saved to: ' + outputPath)

// Generate comparison helper
module.exports = { results: results, fmtNs: fmtNs, opsPerSec: opsPerSec }
