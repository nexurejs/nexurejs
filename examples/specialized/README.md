# Specialized Examples

This directory contains advanced, specialized examples that demonstrate specific features and optimization techniques in NexureJS.

## 🎯 Overview

These examples are designed for developers who want to:
- **Maximize Performance** - Leverage native modules and optimizations
- **Implement Advanced Patterns** - Use sophisticated architectural patterns
- **Handle Specialized Use Cases** - Address specific technical requirements
- **Optimize Production Systems** - Apply enterprise-level optimizations

## 📁 Examples

### 🔐 **Authentication & Security**
- **[JWT Authentication](jwt-auth-example.ts)** - Complete JWT implementation with middleware

### ⚡ **Performance Optimization**
- **[Adaptive Buffer Management](adaptive-buffer-example.js)** - Dynamic buffer pool optimization
- **[Adaptive Timeout Management](adaptive-timeout-example.js)** - Smart timeout adjustment
- **[Adaptive Worker Pool](adaptive-worker-pool-demo.js)** - Dynamic worker scaling
- **[Phase 2 Optimization Showcase](phase2-optimization-showcase.cjs)** - Advanced native optimizations

### 🌊 **Stream Processing**
- **[Optimized Stream Processing](optimized-stream-example.js)** - High-performance stream handling
- **[Advanced Stream Processing](stream-processing-example.js)** - Complex stream transformations

### 🏎️ **Native Performance**
- **[Native WebSocket](native-websocket.ts)** - High-performance WebSocket with native acceleration
- **[Native Modules Showcase](native-modules-example.ts)** - Comprehensive native module usage

### 📁 **Static File Serving**
- **[Static File Server](static-file-server.js)** - Optimized static file serving
- **[Static File Benchmark](static-file-benchmark.js)** - Performance comparison

## 🚀 Quick Start

### Prerequisites
```bash
# Install dependencies
npm install

# Build native modules (for native examples)
npm run build:native

# Build TypeScript (for .ts examples)
npm run build
```

### Running Examples

#### JavaScript Examples
```bash
# Adaptive examples
node examples/specialized/adaptive-buffer-example.js
node examples/specialized/adaptive-timeout-example.js
node examples/specialized/adaptive-worker-pool-demo.js

# Stream processing
node examples/specialized/optimized-stream-example.js
node examples/specialized/stream-processing-example.js

# Static file serving
node examples/specialized/static-file-server.js

# Performance showcase
node examples/specialized/phase2-optimization-showcase.cjs
```

#### TypeScript Examples
```bash
# Authentication
npx ts-node examples/specialized/jwt-auth-example.ts

# Native performance
npx ts-node examples/specialized/native-websocket.ts
npx ts-node examples/specialized/native-modules-example.ts
```

## 📊 Performance Benchmarks

### Buffer Management Performance
```bash
# Run adaptive buffer example with monitoring
node examples/specialized/adaptive-buffer-example.js

# Expected output:
# - Memory usage optimization
# - Buffer pool efficiency metrics
# - Performance comparison
```

### Stream Processing Throughput
```bash
# Test stream processing performance
node examples/specialized/optimized-stream-example.js

# Benchmark different stream sizes:
curl -X POST -H "Content-Type: application/json" \
  -d '{"size": 1000000}' \
  http://localhost:3000/json-transform
```

### Native Module Performance
```bash
# Compare native vs JavaScript performance
node examples/specialized/phase2-optimization-showcase.cjs

# Expected improvements:
# - 2-5x faster JSON processing
# - 3-10x faster HTTP parsing
# - 5-20x faster routing
```

## 🔧 Configuration & Customization

### Adaptive Buffer Pool
```javascript
const pool = new BufferPool({
  initialSize: 20,
  maxSize: 1000,
  adaptive: true,
  adaptiveInterval: 1000,
  minBufferSize: 1024,
  maxBufferSize: 2 * 1024 * 1024
});
```

### Adaptive Timeout Manager
```javascript
const timeoutManager = new AdaptiveTimeoutManager({
  baseTimeout: 5000,
  minTimeout: 1000,
  maxTimeout: 60000,
  historyWeight: 0.8,
  loadCheckInterval: 1000
});
```

### Adaptive Worker Pool
```javascript
const pool = new AdaptiveWorkerPool({
  workerScript: './worker.js',
  minWorkers: 2,
  maxWorkers: cpus().length,
  predictiveScaling: true,
  patternHistorySize: 20,
  utilizationSmoothingFactor: 0.3
});
```

## 🎯 Use Cases

### High-Traffic APIs
- Use **adaptive buffer management** for memory efficiency
- Implement **adaptive worker pools** for CPU-intensive tasks
- Apply **native modules** for maximum throughput

### Real-Time Applications
- Use **native WebSocket** for low latency
- Implement **adaptive timeouts** for variable network conditions
- Apply **optimized stream processing** for data pipelines

### Microservices
- Use **JWT authentication** for secure service communication
- Implement **static file serving** for asset delivery
- Apply **performance monitoring** for observability

### Data Processing
- Use **stream processing** for large datasets
- Implement **adaptive buffers** for memory optimization
- Apply **native modules** for computational tasks

## 📈 Performance Metrics

### Expected Performance Gains
| Feature | Performance Improvement |
|---------|------------------------|
| Native JSON Processing | 2-5x faster |
| Native HTTP Parsing | 3-10x faster |
| Native Routing | 5-20x faster |
| Adaptive Buffers | 30-70% memory reduction |
| Stream Processing | 50-200% throughput increase |
| Worker Pool Scaling | 2-4x better resource utilization |

### Memory Optimization
- **Adaptive Buffers**: Up to 70% memory reduction
- **Stream Processing**: Constant memory usage regardless of data size
- **Native Modules**: Lower garbage collection pressure

### Latency Improvements
- **Native WebSocket**: 20-50% lower latency
- **Adaptive Timeouts**: 30-60% fewer timeout errors
- **Optimized Streams**: 40-80% faster processing

## 🛠️ Development Tips

### Debugging Native Modules
```bash
# Enable verbose logging
export NEXURE_NATIVE_VERBOSE=1
node your-example.js

# Check native module status
node -e "console.log(require('./dist/native').getNativeModuleStatus())"
```

### Profiling Performance
```bash
# Use built-in performance monitoring
node --prof examples/specialized/phase2-optimization-showcase.cjs

# Analyze performance
node --prof-process isolate-*.log > performance-analysis.txt
```

### Memory Analysis
```
