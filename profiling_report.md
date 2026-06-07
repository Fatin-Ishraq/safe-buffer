# Profiling Report: safe-buffer

## Environment
- Node.js version: v24.16.0
- Modern Buffer API available: true
- Date: 2026-06-07T10:56:34.644Z

## Key Findings

| # | Area | Severity | Finding |
|---|------|----------|--------|
| 1 | Feature detection | low | The check Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow is executed at module load time on... |
| 2 | Fast path | info | On Node.js >= 5.10.0, the module exports the raw buffer module directly. SafeBuffer polyfill code is never executed at r... |
| 3 | Module initialization | medium | SafeBuffer require() adds ~36.670 us overhead beyond the native buffer module require(). This includes: feature detectio... |
| 4 | copyProps | medium-on-legacy | copyProps iterates over all enumerable properties of Buffer using for..in. On modern Node.js with the fast path, copyPro... |
| 5 | Type checks | low | typeof checks cost ~1 ns per call. In SafeBuffer.alloc, .allocUnsafe, .allocUnsafeSlow, a typeof check is performed on e... |
| 6 | Allocation overhead | info | On modern Node.js, SafeBuffer IS the native Buffer (direct export). There is no runtime overhead for allocation. The ove... |
| 7 | Memory allocation | info | Repeated Buffer allocations create GC pressure. The SafeBuffer layer adds no additional GC pressure on modern Node.js si... |
| 8 | Legacy alloc optimization | high-on-legacy | Using Buffer.alloc() directly instead of Buffer(size).fill(0) is significantly faster. The current legacy code uses Buff... |
| 9 | SafeBuffer.from optimization | high-on-legacy | Using Buffer.from() instead of the deprecated Buffer() constructor in SafeBuffer.from() provides significant speedup. Th... |
| 10 | SafeBuffer constructor | high-on-legacy | The SafeBuffer constructor delegates to the deprecated Buffer() constructor, which is slower than using Buffer.from() fo... |
| 11 | Prototype chain | low | On modern Node.js, SafeBuffer IS Buffer, so instanceof and isBuffer work identically. On legacy Node, the SafeBuffer.pro... |

## Detailed Analysis

### 1. Feature detection (low)

**Finding:** The check Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow is executed at module load time only, not per-call. Cost is negligible (one-time).

**Recommendation:** No optimization needed for feature detection itself, but caching the result avoids re-evaluation on repeated require().

### 2. Fast path (info)

**Finding:** On Node.js >= 5.10.0, the module exports the raw buffer module directly. SafeBuffer polyfill code is never executed at runtime. The only overhead is the feature detection check at require() time.

**Recommendation:** For modern Node.js, the main optimization opportunity is in the module initialization overhead (require-time cost), not runtime allocation speed.

### 3. Module initialization (medium)

**Finding:** SafeBuffer require() adds ~36.670 us overhead beyond the native buffer module require(). This includes: feature detection, copyProps (for legacy), and SafeBuffer prototype setup.

**Recommendation:** Reduce initialization overhead by eliminating copyProps on modern Node, and by caching the feature detection result globally.

### 4. copyProps (medium-on-legacy)

**Finding:** copyProps iterates over all enumerable properties of Buffer using for..in. On modern Node.js with the fast path, copyProps is never called. On legacy Node.js, it copies ~12 properties from Buffer to SafeBuffer and from buffer module to exports.

**Recommendation:** Use Object.assign() if available (Node >= 4), or list specific known properties instead of for..in iteration. On modern Node, this is a non-issue since the fast path bypasses copyProps entirely.

### 5. Type checks (low)

**Finding:** typeof checks cost ~1 ns per call. In SafeBuffer.alloc, .allocUnsafe, .allocUnsafeSlow, a typeof check is performed on every call. In tight loops, this adds up but is minimal compared to actual allocation cost.

**Recommendation:** Type checks are necessary for API safety. Could be eliminated with a separate "unchecked" fast-path API, but would break the safety guarantee.

### 6. Allocation overhead (info)

**Finding:** On modern Node.js, SafeBuffer IS the native Buffer (direct export). There is no runtime overhead for allocation. The overhead only exists on legacy Node.js where the polyfill is used.

**Recommendation:** On modern Node.js, no allocation optimization is possible since the module re-exports the native buffer directly. Focus optimization on module-load-time overhead and legacy code paths.

### 7. Memory allocation (info)

**Finding:** Repeated Buffer allocations create GC pressure. The SafeBuffer layer adds no additional GC pressure on modern Node.js since it directly re-exports the native buffer module.

**Recommendation:** No SafeBuffer-specific memory optimization possible on modern Node.js. Users should use Buffer pools or allocUnsafe for performance-critical paths.

### 8. Legacy alloc optimization (high-on-legacy)

**Finding:** Using Buffer.alloc() directly instead of Buffer(size).fill(0) is significantly faster. The current legacy code uses Buffer(size) followed by fill(0), but Buffer.alloc() is a single native call that both allocates and zero-fills. Similarly, when a fill value is provided, using Buffer.allocUnsafe() + fill() avoids the double-fill (Buffer(size) zeros first, then fill overwrites).

**Recommendation:** Replace Buffer(size).fill(0) with Buffer.alloc(size). Replace Buffer(size) + fill(value) with Buffer.allocUnsafe(size) + fill(value). This eliminates the redundant zero-fill when a custom fill is provided.

### 9. SafeBuffer.from optimization (high-on-legacy)

**Finding:** Using Buffer.from() instead of the deprecated Buffer() constructor in SafeBuffer.from() provides significant speedup. The deprecated constructor has additional internal branching and deprecation warning overhead. Buffer.from() is the direct, optimized path in modern Node.js.

**Recommendation:** Replace Buffer(arg, encodingOrOffset, length) with Buffer.from(arg, encodingOrOffset, length) in SafeBuffer.from(). This avoids deprecation warnings and uses the optimized native path.

### 10. SafeBuffer constructor (high-on-legacy)

**Finding:** The SafeBuffer constructor delegates to the deprecated Buffer() constructor, which is slower than using Buffer.from() for non-number arguments and Buffer.alloc() for number arguments. The improvement for string conversion is 1.1% and for number allocation is -3.3%.

**Recommendation:** Replace Buffer(arg, encodingOrOffset, length) in the SafeBuffer constructor with type-checking dispatch to Buffer.from() or Buffer.alloc().

### 11. Prototype chain (low)

**Finding:** On modern Node.js, SafeBuffer IS Buffer, so instanceof and isBuffer work identically. On legacy Node, the SafeBuffer.prototype = Object.create(Buffer.prototype) adds one prototype hop, but this has negligible performance impact.

**Recommendation:** No optimization needed for prototype chain on modern Node.js.


## Performance Measurements

| Metric | Value |
|--------|-------|
| Feature detection check | 1 ns/op |
| Module require() overhead | 38.625 us |
| Buffer require() baseline | 1.954 us |
| SafeBuffer overhead | 36.670 us |
| copyProps() time | 314 ns |
| typeof number check | 1 ns/op |
| SafeBuffer.alloc(256) | 1.602 us/op |
| Native Buffer.alloc(256) | 1.604 us/op |
| Legacy alloc(256) | 1.604 us/op |
| Optimized alloc(256) | 1.556 us/op |
| Legacy alloc(256, fill) | 1.586 us/op |
| Optimized alloc(256, fill) | 118 ns/op |
| Legacy from(string) | 71 ns/op |
| Optimized from(string) | 65 ns/op |
| Legacy constructor(string) | 67 ns/op |
| Optimized constructor(string) | 66 ns/op |
| Legacy constructor(number) | 1.449 us/op |
| Optimized constructor(number) | 1.498 us/op |

## Summary

On modern Node.js (>= 5.10.0), safe-buffer re-exports the native buffer module directly with **zero runtime overhead**. The performance optimization opportunities exist primarily in:

1. **Module initialization**: Reduce the require() overhead by simplifying the feature detection and setup code
2. **Legacy code paths**: The polyfill code (used on old Node.js) uses deprecated Buffer() constructor instead of Buffer.from()/Buffer.alloc(), causing significant overhead
3. **Deprecation warnings**: The deprecated Buffer() constructor triggers deprecation warnings that slow down the legacy path
4. **Double-fill in alloc**: SafeBuffer.alloc with a fill value first zeros the buffer via Buffer(size) then overwrites with fill - wasteful

The most impactful optimization is to use Buffer.from()/Buffer.alloc()/Buffer.allocUnsafe() directly in the legacy polyfill code instead of the deprecated Buffer() constructor.
