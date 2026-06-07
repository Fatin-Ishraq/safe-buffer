/*!
 * Comprehensive benchmark comparing baseline vs optimized safe-buffer
 * Tests both the modern fast-path AND the legacy polyfill path explicitly
 */
'use strict'

const path = require('path')
const fs = require('fs')

function clock () {
  const t = process.hrtime()
  return t[0] * 1e9 + t[1]
}

function fmtNs (ns) {
  if (ns >= 1e9) return (ns / 1e9).toFixed(3) + ' s'
  if (ns >= 1e6) return (ns / 1e6).toFixed(3) + ' ms'
  if (ns >= 1e3) return (ns / 1e3).toFixed(3) + ' us'
  return ns.toFixed(0) + ' ns'
}

function opsPerSec (ns, iterations) {
  return (iterations / (ns / 1e9)).toFixed(0)
}

const WARMUP = 3
const RUNS = 10

function runBench (name, fn, iterations) {
  for (let w = 0; w < WARMUP; w++) fn(iterations)
  const times = []
  for (let r = 0; r < RUNS; r++) {
    const start = clock()
    fn(iterations)
    const end = clock()
    times.push(end - start)
  }
  const totalNs = times.reduce(function (a, b) { return a + b }, 0)
  const avgNs = totalNs / RUNS
  const sorted = times.slice().sort(function (a, b) { return a - b })
  const medianNs = sorted[Math.floor(sorted.length / 2)]
  return {
    name,
    iterations,
    perOp: fmtNs(avgNs / iterations),
    opsPerSec: opsPerSec(avgNs, iterations),
    median: fmtNs(medianNs),
    avgNsRaw: avgNs,
    perOpNsRaw: avgNs / iterations,
    medianNsRaw: medianNs
  }
}

const results = []
const testString = 'Hello, World! This is a test string for buffer conversion benchmarks.'
const testArray = []
for (let i = 0; i < 256; i++) testArray.push(i & 0xff)

// ============================
// PART 1: Modern path (full module)
// ============================
console.log('\n========== PART 1: Modern Path (Full Module) ==========\n')

const SafeBuffer = require('../').Buffer

const tests = [
  {
    name: 'Buffer.alloc small (16B)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.alloc(16) } },
    iters: 1000000
  },
  {
    name: 'Buffer.alloc medium (4KB)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.alloc(4096) } },
    iters: 500000
  },
  {
    name: 'Buffer.alloc large (1MB)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.alloc(1048576) } },
    iters: 10000
  },
  {
    name: 'Buffer.allocUnsafe small (16B)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.allocUnsafe(16) } },
    iters: 1000000
  },
  {
    name: 'Buffer.allocUnsafe medium (4KB)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.allocUnsafe(4096) } },
    iters: 500000
  },
  {
    name: 'Buffer.from string (utf8)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.from(ts) } },
    iters: 1000000
  },
  {
    name: 'Buffer.from string (hex)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.from('deadbeefcafebabe', 'hex') } },
    iters: 500000
  },
  {
    name: 'Buffer.from array',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.from(ta) } },
    iters: 500000
  },
  {
    name: 'Buffer.alloc + fill(0xab)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.alloc(256, 0xab) } },
    iters: 500000
  },
  {
    name: 'new SafeBuffer(string)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) new Buffer(ts) } },
    iters: 1000000
  },
  {
    name: 'new SafeBuffer(array)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) new Buffer(ta) } },
    iters: 500000
  },
  {
    name: 'Buffer.allocUnsafeSlow (4KB)',
    fn: function (Buffer, ts, ta) { return function (n) { for (let i = 0; i < n; i++) Buffer.allocUnsafeSlow(4096) } },
    iters: 100000
  },
  {
    name: 'Module require() overhead',
    fn: function (Buffer, ts, ta) {
      const modKey = require.resolve('..')
      return function (n) { for (let i = 0; i < n; i++) { delete require.cache[modKey]; require('..') } }
    },
    iters: 1000
  }
]

tests.forEach(function (tc) {
  const r = runBench(tc.name, tc.fn(SafeBuffer, testString, testArray), tc.iters)
  results.push(Object.assign({ suite: 'Optimized' }, r))
  console.log('  ' + r.name + ': ' + r.perOp + '/op  (' + r.opsPerSec + ' ops/s)')
})

// ============================
// PART 2: Legacy path simulation
// ============================
console.log('\n========== PART 2: Legacy Path Simulation ==========\n')

const NativeBuffer = require('buffer').Buffer

// Baseline (original) legacy implementations
function LegacySafeBuffer (arg, encodingOrOffset, length) {
  return NativeBuffer(arg, encodingOrOffset, length)
}
LegacySafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') throw new TypeError('Argument must not be a number')
  return NativeBuffer(arg, encodingOrOffset, length)
}
LegacySafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  const buf = NativeBuffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}
LegacySafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  return NativeBuffer(size)
}

// Optimized legacy implementations
function OptimizedSafeBuffer (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') return NativeBuffer.alloc(arg)
  return NativeBuffer.from(arg, encodingOrOffset, length)
}
OptimizedSafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') throw new TypeError('Argument must not be a number')
  return NativeBuffer.from(arg, encodingOrOffset, length)
}
OptimizedSafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  if (fill !== undefined) {
    const buf = NativeBuffer.allocUnsafe(size)
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
    return buf
  }
  return NativeBuffer.alloc(size)
}
OptimizedSafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  return NativeBuffer.allocUnsafe(size)
}

const legacyTests = [
  {
    name: 'alloc(256) no fill',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.alloc(256) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.alloc(256) },
    iters: 500000
  },
  {
    name: 'alloc(256, 0xab) with fill',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.alloc(256, 0xab) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.alloc(256, 0xab) },
    iters: 500000
  },
  {
    name: 'alloc(4096) no fill',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.alloc(4096) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.alloc(4096) },
    iters: 200000
  },
  {
    name: 'alloc(4096, 0xab) with fill',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.alloc(4096, 0xab) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.alloc(4096, 0xab) },
    iters: 200000
  },
  {
    name: 'from(string)',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.from(testString) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.from(testString) },
    iters: 1000000
  },
  {
    name: 'from(array)',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.from(testArray) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.from(testArray) },
    iters: 500000
  },
  {
    name: 'allocUnsafe(256)',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.allocUnsafe(256) },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.allocUnsafe(256) },
    iters: 1000000
  },
  {
    name: 'constructor(string)',
    baseline: function (n) { for (let i = 0; i < n; i++) new LegacySafeBuffer(testString) },
    optimized: function (n) { for (let i = 0; i < n; i++) new OptimizedSafeBuffer(testString) },
    iters: 1000000
  },
  {
    name: 'constructor(array)',
    baseline: function (n) { for (let i = 0; i < n; i++) new LegacySafeBuffer(testArray) },
    optimized: function (n) { for (let i = 0; i < n; i++) new OptimizedSafeBuffer(testArray) },
    iters: 500000
  },
  {
    name: 'constructor(number)',
    baseline: function (n) { for (let i = 0; i < n; i++) new LegacySafeBuffer(256) },
    optimized: function (n) { for (let i = 0; i < n; i++) new OptimizedSafeBuffer(256) },
    iters: 1000000
  },
  {
    name: 'alloc(256, "abc", "utf8") with encoding',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.alloc(256, 'abc', 'utf8') },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.alloc(256, 'abc', 'utf8') },
    iters: 500000
  },
  {
    name: 'from(hex string)',
    baseline: function (n) { for (let i = 0; i < n; i++) LegacySafeBuffer.from('deadbeefcafebabe', 'hex') },
    optimized: function (n) { for (let i = 0; i < n; i++) OptimizedSafeBuffer.from('deadbeefcafebabe', 'hex') },
    iters: 500000
  }
]

legacyTests.forEach(function (tc) {
  const baselineResult = runBench('Legacy: ' + tc.name, tc.baseline, tc.iters)
  const optimizedResult = runBench('Optimized: ' + tc.name, tc.optimized, tc.iters)

  const improvement = ((baselineResult.perOpNsRaw / optimizedResult.perOpNsRaw - 1) * 100).toFixed(1)
  const speedup = (baselineResult.perOpNsRaw / optimizedResult.perOpNsRaw).toFixed(2)

  results.push(Object.assign({ suite: 'Legacy-Baseline' }, baselineResult))
  results.push(Object.assign({ suite: 'Legacy-Optimized' }, optimizedResult))

  console.log('  ' + tc.name + ':')
  console.log('    Baseline:  ' + baselineResult.perOp + '/op  (' + baselineResult.opsPerSec + ' ops/s)')
  console.log('    Optimized: ' + optimizedResult.perOp + '/op  (' + optimizedResult.opsPerSec + ' ops/s)')
  console.log('    Speedup:   ' + speedup + 'x  (' + improvement + '% faster)')
})

// Save all results
const outputPath = path.resolve(__dirname, '..', 'benchmark_results.json')
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
console.log('\nResults saved to: ' + outputPath)
