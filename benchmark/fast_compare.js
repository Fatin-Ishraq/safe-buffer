/*!
 * Fast comparison benchmark: baseline vs optimized legacy paths
 */
'use strict'

const fs = require('fs')
const path = require('path')

function clock () {
  const t = process.hrtime()
  return t[0] * 1e9 + t[1]
}

function fmtNs (ns) {
  if (ns >= 1e6) return (ns / 1e6).toFixed(3) + ' ms'
  if (ns >= 1e3) return (ns / 1e3).toFixed(3) + ' us'
  return ns.toFixed(0) + ' ns'
}

const RUNS = 5
const WARMUP = 2

function bench (fn, iters) {
  for (let w = 0; w < WARMUP; w++) fn(iters)
  const times = []
  for (let r = 0; r < RUNS; r++) {
    const s = clock(); fn(iters); const e = clock()
    times.push(e - s)
  }
  return times.reduce(function (a, b) { return a + b }, 0) / RUNS / iters
}

const NativeBuffer = require('buffer').Buffer
const testStr = 'Hello, World! This is a test string for buffer conversion benchmarks.'
const testArr = []
for (let i = 0; i < 256; i++) testArr.push(i & 0xff)

// Legacy implementations (original code)
function legacyAlloc (size, fill, encoding) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  const buf = NativeBuffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') buf.fill(fill, encoding)
    else buf.fill(fill)
  } else {
    buf.fill(0)
  }
  return buf
}
function legacyFrom (arg, enc, len) {
  if (typeof arg === 'number') throw new TypeError('Argument must not be a number')
  return NativeBuffer(arg, enc, len)
}
function legacyAllocUnsafe (size) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  return NativeBuffer(size)
}
function legacyCtor (arg, enc, len) {
  return NativeBuffer(arg, enc, len)
}

// Optimized implementations
function optAlloc (size, fill, encoding) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  if (fill !== undefined) {
    const buf = NativeBuffer.allocUnsafe(size)
    if (typeof encoding === 'string') buf.fill(fill, encoding)
    else buf.fill(fill)
    return buf
  }
  return NativeBuffer.alloc(size)
}
function optFrom (arg, enc, len) {
  if (typeof arg === 'number') throw new TypeError('Argument must not be a number')
  return NativeBuffer.from(arg, enc, len)
}
function optAllocUnsafe (size) {
  if (typeof size !== 'number') throw new TypeError('Argument must be a number')
  return NativeBuffer.allocUnsafe(size)
}
function optCtor (arg, enc, len) {
  if (typeof arg === 'number') return NativeBuffer.alloc(arg)
  return NativeBuffer.from(arg, enc, len)
}

const results = {}
const N = 200000

console.log('\n=== Legacy Path: Baseline vs Optimized ===\n')

const tests = [
  ['alloc(256)', function () { legacyAlloc(256) }, function () { optAlloc(256) }],
  ['alloc(256, 0xab)', function () { legacyAlloc(256, 0xab) }, function () { optAlloc(256, 0xab) }],
  ['alloc(4096)', function () { legacyAlloc(4096) }, function () { optAlloc(4096) }],
  ['alloc(4096, 0xab)', function () { legacyAlloc(4096, 0xab) }, function () { optAlloc(4096, 0xab) }],
  ['from(string)', function () { legacyFrom(testStr) }, function () { optFrom(testStr) }],
  ['from(array)', function () { legacyFrom(testArr) }, function () { optFrom(testArr) }],
  ['allocUnsafe(256)', function () { legacyAllocUnsafe(256) }, function () { optAllocUnsafe(256) }],
  ['ctor(string)', function () { legacyCtor(testStr) }, function () { optCtor(testStr) }],
  ['ctor(array)', function () { legacyCtor(testArr) }, function () { optCtor(testArr) }],
  ['ctor(number)', function () { legacyCtor(256) }, function () { optCtor(256) }],
  ['alloc(256, "abc", "utf8")', function () { legacyAlloc(256, 'abc', 'utf8') }, function () { optAlloc(256, 'abc', 'utf8') }],
  ['from(hex)', function () { legacyFrom('deadbeefcafebabe', 'hex') }, function () { optFrom('deadbeefcafebabe', 'hex') }]
]

tests.forEach(function (tc) {
  const name = tc[0]
  const bFn = tc[1]
  const oFn = tc[2]

  const bNs = bench(function (n) { for (let i = 0; i < n; i++) bFn() }, N)
  const oNs = bench(function (n) { for (let i = 0; i < n; i++) oFn() }, N)

  const speedup = (bNs / oNs).toFixed(2)
  const pct = ((bNs / oNs - 1) * 100).toFixed(1)

  results[name] = {
    baselineNsPerOp: bNs,
    optimizedNsPerOp: oNs,
    speedup,
    improvement: pct
  }

  console.log('  ' + name + ':')
  console.log('    Baseline:  ' + fmtNs(bNs) + '/op')
  console.log('    Optimized: ' + fmtNs(oNs) + '/op')
  console.log('    Speedup:   ' + speedup + 'x (' + pct + '%)\n')
})

// Module require overhead test
const modKey = path.resolve(__dirname, '..', 'index.js')
const origKey = path.resolve(__dirname, '..', 'index.original.js')

// Copy original to test
const origCode = fs.readFileSync(origKey, 'utf8')

// Baseline require overhead
const bReq = bench(function (n) {
  for (let i = 0; i < n; i++) {
    delete require.cache[modKey]
    require(modKey)
  }
}, 500)

// Save original, test, then restore
fs.writeFileSync(modKey + '.tmp', fs.readFileSync(modKey))
fs.writeFileSync(modKey, origCode)
const origReq = bench(function (n) {
  for (let i = 0; i < n; i++) {
    delete require.cache[modKey]
    require(modKey)
  }
}, 500)
// Restore optimized
fs.writeFileSync(modKey, fs.readFileSync(modKey + '.tmp'))
fs.unlinkSync(modKey + '.tmp')

const reqSpeedup = (origReq / bReq).toFixed(2)
const reqPct = ((origReq / bReq - 1) * 100).toFixed(1)
results['require() overhead'] = {
  baselineNsPerOp: origReq,
  optimizedNsPerOp: bReq,
  speedup: reqSpeedup,
  improvement: reqPct
}

console.log('  require() overhead:')
console.log('    Baseline:  ' + fmtNs(origReq) + '/op')
console.log('    Optimized: ' + fmtNs(bReq) + '/op')
console.log('    Speedup:   ' + reqSpeedup + 'x (' + reqPct + '%)\n')

// Save JSON
const outPath = path.resolve(__dirname, '..', 'optimization_results.json')
fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log('Results saved to: ' + outPath)
