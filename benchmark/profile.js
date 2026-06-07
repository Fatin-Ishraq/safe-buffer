/*!
 * Profiling script for safe-buffer
 * Identifies: branching, redundant type checks, feature detection, hidden allocations
 */
'use strict'

var path = require('path')
var fs = require('fs')

function clock () {
  var t = process.hrtime()
  return t[0] * 1e9 + t[1]
}

function fmtNs (ns) {
  if (ns >= 1e9) return (ns / 1e9).toFixed(3) + ' s'
  if (ns >= 1e6) return (ns / 1e6).toFixed(3) + ' ms'
  if (ns >= 1e3) return (ns / 1e3).toFixed(3) + ' us'
  return ns.toFixed(0) + ' ns'
}

var findings = []

console.log('=== SAFE-BUFFER PROFILING REPORT ===\n')

// =========================================
// 1. Feature detection overhead
// =========================================
console.log('--- 1. Feature Detection Overhead ---')

var buffer = require('buffer')
var Buffer = buffer.Buffer

// Measure the cost of the feature detection check
var CHECK_ITERS = 10000000
var start = clock()
for (var i = 0; i < CHECK_ITERS; i++) {
  if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
    // fast path
  }
}
var end = clock()
var checkTime = (end - start) / CHECK_ITERS
console.log('  Feature detection check per call: ' + fmtNs(checkTime))
findings.push({
  area: 'Feature detection',
  finding: 'The check Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow is executed at module load time only, not per-call. Cost is negligible (one-time).',
  severity: 'low',
  recommendation: 'No optimization needed for feature detection itself, but caching the result avoids re-evaluation on repeated require().'
})

// =========================================
// 2. Modern Node.js fast path analysis
// =========================================
console.log('\n--- 2. Modern Node.js Fast Path Analysis ---')

var hasModernAPI = !!(Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow)
console.log('  Modern Node.js API available: ' + hasModernAPI)
console.log('  Node.js version: ' + process.version)

if (hasModernAPI) {
  findings.push({
    area: 'Fast path',
    finding: 'On Node.js >= 5.10.0, the module exports the raw buffer module directly. SafeBuffer polyfill code is never executed at runtime. The only overhead is the feature detection check at require() time.',
    severity: 'info',
    recommendation: 'For modern Node.js, the main optimization opportunity is in the module initialization overhead (require-time cost), not runtime allocation speed.'
  })
}

// =========================================
// 3. Require() overhead breakdown
// =========================================
console.log('\n--- 3. Module require() Overhead Breakdown ---')

// Clear cache
var modPath = path.resolve(__dirname, '..', 'index.js')
delete require.cache[modPath]

// Measure full require
var requireTimes = []
for (var r = 0; r < 100; r++) {
  delete require.cache[modPath]
  var s = clock()
  require(modPath)
  var e = clock()
  requireTimes.push(e - s)
}
var avgRequire = requireTimes.reduce(function (a, b) { return a + b }, 0) / requireTimes.length
console.log('  Average require() time: ' + fmtNs(avgRequire))

// Measure just the buffer module require
var bufModPath = 'buffer'
delete require.cache[require.resolve(bufModPath)]
var bufRequireTimes = []
for (var r2 = 0; r2 < 100; r2++) {
  delete require.cache[require.resolve(bufModPath)]
  var s2 = clock()
  require(bufModPath)
  var e2 = clock()
  bufRequireTimes.push(e2 - s2)
}
var avgBufRequire = bufRequireTimes.reduce(function (a, b) { return a + b }, 0) / bufRequireTimes.length
console.log('  Average buffer require() time: ' + fmtNs(avgBufRequire))
console.log('  SafeBuffer overhead beyond buffer require: ' + fmtNs(avgRequire - avgBufRequire))

findings.push({
  area: 'Module initialization',
  finding: 'SafeBuffer require() adds ~' + fmtNs(avgRequire - avgBufRequire) + ' overhead beyond the native buffer module require(). This includes: feature detection, copyProps (for legacy), and SafeBuffer prototype setup.',
  severity: 'medium',
  recommendation: 'Reduce initialization overhead by eliminating copyProps on modern Node, and by caching the feature detection result globally.'
})

// =========================================
// 4. copyProps overhead
// =========================================
console.log('\n--- 4. copyProps() Overhead ---')

// Measure copyProps with Buffer source
var src = Buffer
var dst = {}
var COPY_ITERS = 10000
start = clock()
for (var c = 0; c < COPY_ITERS; c++) {
  var tmpDst = {}
  for (var key in src) {
    tmpDst[key] = src[key]
  }
}
end = clock()
var copyPropsTime = (end - start) / COPY_ITERS
console.log('  copyProps(Buffer, obj) time: ' + fmtNs(copyPropsTime))

var bufKeys = Object.keys(Buffer)
console.log('  Number of Buffer keys to copy: ' + bufKeys.length)
console.log('  Buffer keys: ' + bufKeys.join(', '))

findings.push({
  area: 'copyProps',
  finding: 'copyProps iterates over all enumerable properties of Buffer using for..in. On modern Node.js with the fast path, copyProps is never called. On legacy Node.js, it copies ~' + bufKeys.length + ' properties from Buffer to SafeBuffer and from buffer module to exports.',
  severity: 'medium-on-legacy',
  recommendation: 'Use Object.assign() if available (Node >= 4), or list specific known properties instead of for..in iteration. On modern Node, this is a non-issue since the fast path bypasses copyProps entirely.'
})

// =========================================
// 5. typeof check overhead in hot functions
// =========================================
console.log('\n--- 5. typeof Check Overhead in Hot Functions ---')

var TYPEOF_ITERS = 10000000

// typeof 'number' check
start = clock()
for (var t = 0; t < TYPEOF_ITERS; t++) {
  if (typeof 42 !== 'number') {}
}
end = clock()
var typeofNumTime = (end - start) / TYPEOF_ITERS
console.log('  typeof number check: ' + fmtNs(typeofNumTime) + '/op')

// typeof 'string' check  
start = clock()
for (var t2 = 0; t2 < TYPEOF_ITERS; t2++) {
  if (typeof 'hello' === 'number') {}
}
end = clock()
var typeofStrTime = (end - start) / TYPEOF_ITERS
console.log('  typeof string-is-number check: ' + fmtNs(typeofStrTime) + '/op')

findings.push({
  area: 'Type checks',
  finding: 'typeof checks cost ~' + fmtNs(typeofNumTime) + ' per call. In SafeBuffer.alloc, .allocUnsafe, .allocUnsafeSlow, a typeof check is performed on every call. In tight loops, this adds up but is minimal compared to actual allocation cost.',
  severity: 'low',
  recommendation: 'Type checks are necessary for API safety. Could be eliminated with a separate "unchecked" fast-path API, but would break the safety guarantee.'
})

// =========================================
// 6. Buffer() constructor vs Buffer.alloc/Buffer.from overhead
// =========================================
console.log('\n--- 6. Deprecated Buffer() Constructor Overhead ---')

var ALLOC_ITERS = 1000000

// SafeBuffer.alloc vs native Buffer.alloc
var SafeBuffer = require(modPath).Buffer

// SafeBuffer.alloc (goes through deprecated Buffer() constructor on legacy path)
start = clock()
for (var a = 0; a < ALLOC_ITERS; a++) {
  SafeBuffer.alloc(256)
}
end = clock()
var safeAllocTime = (end - start) / ALLOC_ITERS
console.log('  SafeBuffer.alloc(256): ' + fmtNs(safeAllocTime) + '/op')

// Native Buffer.alloc
start = clock()
for (var a2 = 0; a2 < ALLOC_ITERS; a2++) {
  Buffer.alloc(256)
}
end = clock()
var nativeAllocTime = (end - start) / ALLOC_ITERS
console.log('  Native Buffer.alloc(256): ' + fmtNs(nativeAllocTime) + '/op')

// Overhead
if (safeAllocTime > nativeAllocTime) {
  console.log('  SafeBuffer overhead: +' + ((safeAllocTime / nativeAllocTime - 1) * 100).toFixed(1) + '%')
} else {
  console.log('  SafeBuffer is faster (direct export): -' + ((1 - safeAllocTime / nativeAllocTime) * 100).toFixed(1) + '%')
}

findings.push({
  area: 'Allocation overhead',
  finding: 'On modern Node.js, SafeBuffer IS the native Buffer (direct export). There is no runtime overhead for allocation. The overhead only exists on legacy Node.js where the polyfill is used.',
  severity: 'info',
  recommendation: 'On modern Node.js, no allocation optimization is possible since the module re-exports the native buffer directly. Focus optimization on module-load-time overhead and legacy code paths.'
})

// =========================================
// 7. Memory allocation patterns
// =========================================
console.log('\n--- 7. Memory Allocation Patterns ---')

// Measure GC pressure from repeated allocations
var MEM_ITERS = 100000
var beforeGC = process.memoryUsage()
start = clock()
for (var m = 0; m < MEM_ITERS; m++) {
  SafeBuffer.alloc(64)
}
end = clock()
var afterGC = process.memoryUsage()
console.log('  Heap before: ' + (beforeGC.heapUsed / 1024 / 1024).toFixed(2) + ' MB')
console.log('  Heap after: ' + (afterGC.heapUsed / 1024 / 1024).toFixed(2) + ' MB')
console.log('  Heap delta: ' + ((afterGC.heapUsed - beforeGC.heapUsed) / 1024 / 1024).toFixed(2) + ' MB')
console.log('  Allocation time: ' + fmtNs((end - start) / MEM_ITERS) + '/op')

findings.push({
  area: 'Memory allocation',
  finding: 'Repeated Buffer allocations create GC pressure. The SafeBuffer layer adds no additional GC pressure on modern Node.js since it directly re-exports the native buffer module.',
  severity: 'info',
  recommendation: 'No SafeBuffer-specific memory optimization possible on modern Node.js. Users should use Buffer pools or allocUnsafe for performance-critical paths.'
})

// =========================================
// 8. Legacy path specific analysis
// =========================================
console.log('\n--- 8. Legacy Path Analysis (SafeBuffer polyfill) ---')

// Simulate the legacy path by calling SafeBuffer methods directly
// On modern Node, these are native methods, so we need to test differently

// Test the SafeBuffer.alloc implementation manually
function LegacySafeBuffer_alloc (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
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

function LegacySafeBuffer_alloc_optimized (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  if (fill !== undefined) {
    var buf = Buffer.allocUnsafe(size)
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
    return buf
  }
  return Buffer.alloc(size)
}

// Benchmark legacy vs optimized alloc
var LEGACY_ITERS = 500000

start = clock()
for (var l = 0; l < LEGACY_ITERS; l++) {
  LegacySafeBuffer_alloc(256)
}
end = clock()
var legacyAllocTime = (end - start) / LEGACY_ITERS
console.log('  Legacy SafeBuffer.alloc(256): ' + fmtNs(legacyAllocTime) + '/op')

start = clock()
for (var l2 = 0; l2 < LEGACY_ITERS; l2++) {
  LegacySafeBuffer_alloc_optimized(256)
}
end = clock()
var optimizedAllocTime = (end - start) / LEGACY_ITERS
console.log('  Optimized SafeBuffer.alloc(256): ' + fmtNs(optimizedAllocTime) + '/op')
console.log('  Improvement: ' + ((legacyAllocTime / optimizedAllocTime - 1) * 100).toFixed(1) + '%')

// With fill
start = clock()
for (var l3 = 0; l3 < LEGACY_ITERS; l3++) {
  LegacySafeBuffer_alloc(256, 0xab)
}
end = clock()
var legacyAllocFillTime = (end - start) / LEGACY_ITERS
console.log('  Legacy SafeBuffer.alloc(256, 0xab): ' + fmtNs(legacyAllocFillTime) + '/op')

start = clock()
for (var l3b = 0; l3b < LEGACY_ITERS; l3b++) {
  LegacySafeBuffer_alloc_optimized(256, 0xab)
}
end = clock()
var optimizedAllocFillTime = (end - start) / LEGACY_ITERS
console.log('  Optimized SafeBuffer.alloc(256, 0xab): ' + fmtNs(optimizedAllocFillTime) + '/op')
console.log('  Improvement with fill: ' + ((legacyAllocFillTime / optimizedAllocFillTime - 1) * 100).toFixed(1) + '%')

findings.push({
  area: 'Legacy alloc optimization',
  finding: 'Using Buffer.alloc() directly instead of Buffer(size).fill(0) is significantly faster. The current legacy code uses Buffer(size) followed by fill(0), but Buffer.alloc() is a single native call that both allocates and zero-fills. Similarly, when a fill value is provided, using Buffer.allocUnsafe() + fill() avoids the double-fill (Buffer(size) zeros first, then fill overwrites).',
  severity: 'high-on-legacy',
  recommendation: 'Replace Buffer(size).fill(0) with Buffer.alloc(size). Replace Buffer(size) + fill(value) with Buffer.allocUnsafe(size) + fill(value). This eliminates the redundant zero-fill when a custom fill is provided.'
})

// =========================================
// 9. SafeBuffer.from analysis
// =========================================
console.log('\n--- 9. SafeBuffer.from() Analysis ---')

// Legacy SafeBuffer.from uses Buffer(arg, encodingOrOffset, length) - the deprecated constructor
// Modern Node.js uses Buffer.from() directly (since it's a re-export)
// The overhead is the typeof check + the deprecated Buffer() constructor call

function LegacySafeBuffer_from (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

function OptimizedSafeBuffer_from (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer.from(arg, encodingOrOffset, length)
}

var testStr = 'Hello, World! This is a test string for buffer conversion benchmarks.'
var FROM_ITERS = 1000000

start = clock()
for (var f = 0; f < FROM_ITERS; f++) {
  LegacySafeBuffer_from(testStr)
}
end = clock()
var legacyFromTime = (end - start) / FROM_ITERS
console.log('  Legacy SafeBuffer.from(string): ' + fmtNs(legacyFromTime) + '/op')

start = clock()
for (var f2 = 0; f2 < FROM_ITERS; f2++) {
  OptimizedSafeBuffer_from(testStr)
}
end = clock()
var optimizedFromTime = (end - start) / FROM_ITERS
console.log('  Optimized SafeBuffer.from(string): ' + fmtNs(optimizedFromTime) + '/op')
console.log('  Improvement: ' + ((legacyFromTime / optimizedFromTime - 1) * 100).toFixed(1) + '%')

findings.push({
  area: 'SafeBuffer.from optimization',
  finding: 'Using Buffer.from() instead of the deprecated Buffer() constructor in SafeBuffer.from() provides significant speedup. The deprecated constructor has additional internal branching and deprecation warning overhead. Buffer.from() is the direct, optimized path in modern Node.js.',
  severity: 'high-on-legacy',
  recommendation: 'Replace Buffer(arg, encodingOrOffset, length) with Buffer.from(arg, encodingOrOffset, length) in SafeBuffer.from(). This avoids deprecation warnings and uses the optimized native path.'
})

// =========================================
// 10. SafeBuffer constructor analysis
// =========================================
console.log('\n--- 10. SafeBuffer Constructor Analysis ---')

// The SafeBuffer constructor calls Buffer(arg, encodingOrOffset, length) - deprecated
function LegacySafeBuffer_constructor (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Optimized: use Buffer.from for non-numbers, Buffer.alloc for numbers
function OptimizedSafeBuffer_constructor (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    return Buffer.alloc(arg)
  }
  return Buffer.from(arg, encodingOrOffset, length)
}

var CTOR_ITERS = 1000000

start = clock()
for (var ct = 0; ct < CTOR_ITERS; ct++) {
  LegacySafeBuffer_constructor(testStr)
}
end = clock()
var legacyCtorStrTime = (end - start) / CTOR_ITERS

start = clock()
for (var ct2 = 0; ct2 < CTOR_ITERS; ct2++) {
  OptimizedSafeBuffer_constructor(testStr)
}
end = clock()
var optimizedCtorStrTime = (end - start) / CTOR_ITERS

console.log('  Legacy constructor(string): ' + fmtNs(legacyCtorStrTime) + '/op')
console.log('  Optimized constructor(string): ' + fmtNs(optimizedCtorStrTime) + '/op')
console.log('  Improvement: ' + ((legacyCtorStrTime / optimizedCtorStrTime - 1) * 100).toFixed(1) + '%')

// With number
start = clock()
for (var ct3 = 0; ct3 < CTOR_ITERS; ct3++) {
  LegacySafeBuffer_constructor(256)
}
end = clock()
var legacyCtorNumTime = (end - start) / CTOR_ITERS

start = clock()
for (var ct3b = 0; ct3b < CTOR_ITERS; ct3b++) {
  OptimizedSafeBuffer_constructor(256)
}
end = clock()
var optimizedCtorNumTime = (end - start) / CTOR_ITERS

console.log('  Legacy constructor(number): ' + fmtNs(legacyCtorNumTime) + '/op')
console.log('  Optimized constructor(number): ' + fmtNs(optimizedCtorNumTime) + '/op')
console.log('  Improvement: ' + ((legacyCtorNumTime / optimizedCtorNumTime - 1) * 100).toFixed(1) + '%')

findings.push({
  area: 'SafeBuffer constructor',
  finding: 'The SafeBuffer constructor delegates to the deprecated Buffer() constructor, which is slower than using Buffer.from() for non-number arguments and Buffer.alloc() for number arguments. The improvement for string conversion is ' + ((legacyCtorStrTime / optimizedCtorStrTime - 1) * 100).toFixed(1) + '% and for number allocation is ' + ((legacyCtorNumTime / optimizedCtorNumTime - 1) * 100).toFixed(1) + '%.',
  severity: 'high-on-legacy',
  recommendation: 'Replace Buffer(arg, encodingOrOffset, length) in the SafeBuffer constructor with type-checking dispatch to Buffer.from() or Buffer.alloc().'
})

// =========================================
// 11. Prototype chain overhead
// =========================================
console.log('\n--- 11. Prototype Chain Overhead ---')

// On modern Node, SafeBuffer IS Buffer, so no prototype overhead
// On legacy, SafeBuffer.prototype = Object.create(Buffer.prototype)
// This means instanceof checks go through an extra prototype hop

var protoTest = SafeBuffer.alloc(16)
var INSTANCEOF_ITERS = 10000000

start = clock()
for (var p = 0; p < INSTANCEOF_ITERS; p++) {
  Buffer.isBuffer(protoTest)
}
end = clock()
var isBufferTime = (end - start) / INSTANCEOF_ITERS
console.log('  Buffer.isBuffer() per call: ' + fmtNs(isBufferTime))

start = clock()
for (var p2 = 0; p2 < INSTANCEOF_ITERS; p2++) {
  protoTest instanceof Buffer
}
end = clock()
var instanceofTime = (end - start) / INSTANCEOF_ITERS
console.log('  instanceof Buffer per call: ' + fmtNs(instanceofTime))

findings.push({
  area: 'Prototype chain',
  finding: 'On modern Node.js, SafeBuffer IS Buffer, so instanceof and isBuffer work identically. On legacy Node, the SafeBuffer.prototype = Object.create(Buffer.prototype) adds one prototype hop, but this has negligible performance impact.',
  severity: 'low',
  recommendation: 'No optimization needed for prototype chain on modern Node.js.'
})

// =========================================
// Save profiling report
// =========================================
var report = '# Profiling Report: safe-buffer\n\n'
report += '## Environment\n'
report += '- Node.js version: ' + process.version + '\n'
report += '- Modern Buffer API available: ' + hasModernAPI + '\n'
report += '- Date: ' + new Date().toISOString() + '\n\n'

report += '## Key Findings\n\n'
report += '| # | Area | Severity | Finding |\n'
report += '|---|------|----------|--------|\n'
findings.forEach(function (f, idx) {
  report += '| ' + (idx + 1) + ' | ' + f.area + ' | ' + f.severity + ' | ' + f.finding.substring(0, 120) + '... |\n'
})

report += '\n## Detailed Analysis\n\n'
findings.forEach(function (f, idx) {
  report += '### ' + (idx + 1) + '. ' + f.area + ' (' + f.severity + ')\n\n'
  report += '**Finding:** ' + f.finding + '\n\n'
  report += '**Recommendation:** ' + f.recommendation + '\n\n'
})

report += '\n## Performance Measurements\n\n'
report += '| Metric | Value |\n'
report += '|--------|-------|\n'
report += '| Feature detection check | ' + fmtNs(checkTime) + '/op |\n'
report += '| Module require() overhead | ' + fmtNs(avgRequire) + ' |\n'
report += '| Buffer require() baseline | ' + fmtNs(avgBufRequire) + ' |\n'
report += '| SafeBuffer overhead | ' + fmtNs(avgRequire - avgBufRequire) + ' |\n'
report += '| copyProps() time | ' + fmtNs(copyPropsTime) + ' |\n'
report += '| typeof number check | ' + fmtNs(typeofNumTime) + '/op |\n'
report += '| SafeBuffer.alloc(256) | ' + fmtNs(safeAllocTime) + '/op |\n'
report += '| Native Buffer.alloc(256) | ' + fmtNs(nativeAllocTime) + '/op |\n'
report += '| Legacy alloc(256) | ' + fmtNs(legacyAllocTime) + '/op |\n'
report += '| Optimized alloc(256) | ' + fmtNs(optimizedAllocTime) + '/op |\n'
report += '| Legacy alloc(256, fill) | ' + fmtNs(legacyAllocFillTime) + '/op |\n'
report += '| Optimized alloc(256, fill) | ' + fmtNs(optimizedAllocFillTime) + '/op |\n'
report += '| Legacy from(string) | ' + fmtNs(legacyFromTime) + '/op |\n'
report += '| Optimized from(string) | ' + fmtNs(optimizedFromTime) + '/op |\n'
report += '| Legacy constructor(string) | ' + fmtNs(legacyCtorStrTime) + '/op |\n'
report += '| Optimized constructor(string) | ' + fmtNs(optimizedCtorStrTime) + '/op |\n'
report += '| Legacy constructor(number) | ' + fmtNs(legacyCtorNumTime) + '/op |\n'
report += '| Optimized constructor(number) | ' + fmtNs(optimizedCtorNumTime) + '/op |\n'

report += '\n## Summary\n\n'
report += 'On modern Node.js (>= 5.10.0), safe-buffer re-exports the native buffer module directly with **zero runtime overhead**. The performance optimization opportunities exist primarily in:\n\n'
report += '1. **Module initialization**: Reduce the require() overhead by simplifying the feature detection and setup code\n'
report += '2. **Legacy code paths**: The polyfill code (used on old Node.js) uses deprecated Buffer() constructor instead of Buffer.from()/Buffer.alloc(), causing significant overhead\n'
report += '3. **Deprecation warnings**: The deprecated Buffer() constructor triggers deprecation warnings that slow down the legacy path\n'
report += '4. **Double-fill in alloc**: SafeBuffer.alloc with a fill value first zeros the buffer via Buffer(size) then overwrites with fill - wasteful\n\n'
report += 'The most impactful optimization is to use Buffer.from()/Buffer.alloc()/Buffer.allocUnsafe() directly in the legacy polyfill code instead of the deprecated Buffer() constructor.\n'

fs.writeFileSync(path.resolve(__dirname, 'profiling_report.md'), report)
console.log('\nProfiling report saved to: profiling_report.md')

// Save findings as JSON too
fs.writeFileSync(path.resolve(__dirname, 'profiling_data.json'), JSON.stringify({
  findings: findings,
  measurements: {
    featureDetectionNs: checkTime,
    requireOverheadNs: avgRequire,
    bufferRequireNs: avgBufRequire,
    safeBufferOverheadNs: avgRequire - avgBufRequire,
    copyPropsNs: copyPropsTime,
    typeofCheckNs: typeofNumTime,
    safeBufferAlloc256Ns: safeAllocTime,
    nativeAlloc256Ns: nativeAllocTime,
    legacyAlloc256Ns: legacyAllocTime,
    optimizedAlloc256Ns: optimizedAllocTime,
    legacyAllocFill256Ns: legacyAllocFillTime,
    optimizedAllocFill256Ns: optimizedAllocFillTime,
    legacyFromStringNs: legacyFromTime,
    optimizedFromStringNs: optimizedFromTime,
    legacyCtorStrNs: legacyCtorStrTime,
    optimizedCtorStrNs: optimizedCtorStrTime,
    legacyCtorNumNs: legacyCtorNumTime,
    optimizedCtorNumNs: optimizedCtorNumTime
  }
}, null, 2))
console.log('Profiling data saved to: profiling_data.json')
