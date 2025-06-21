# Optimized Stream Processing in Nexure.js

This document provides guidance on using the optimized stream processing components in Nexure.js to build high-performance, memory-efficient applications.

## Overview

Nexure.js includes an optimized streaming infrastructure designed to:

1. **Minimize memory allocations** by reusing buffers
2. **Reduce GC pressure** through intelligent buffer management
3. **Maximize throughput** for stream transformations
4. **Lower latency** for HTTP request/response handling

Our benchmarks show performance improvements of:
- **20-40% faster processing** time across various data sizes
- **20-50% higher throughput** for data transformation operations
- **More stable memory usage** for long-running operations

## Core Components

### BufferPool

The `BufferPool` is a memory management utility that recycles buffers to reduce allocation overhead:

```javascript
import { BufferPool, globalPool } from 'nexurejs/utils/buffer-pool.js';

// Use the global pool (recommended for most cases)
const buffer = globalPool.acquire(1024); // Get a 1KB buffer
// Use the buffer...
globalPool.release(buffer); // Return it to the pool when done

// Or create your own pool for specialized purposes
const customPool = new BufferPool({
  initialSize: 10,    // Start with 10 buffers
  maxSize: 100,       // Never keep more than 100 buffers
  bufferSize: 16384,  // 16KB buffers
  growthFactor: 1.5,  // Grow by 50% when expanding
  adaptive: true,     // Enable adaptive sizing
  adaptiveInterval: 5000, // Adapt every 5 seconds
  minBufferSize: 1024,    // Minimum 1KB buffers
  maxBufferSize: 1048576  // Maximum 1MB buffers
});
```

#### Adaptive Buffer Sizing

The BufferPool includes adaptive sizing capabilities that automatically optimize memory usage based on workload patterns:

1. **Pattern Recognition**: The pool tracks buffer size usage over time
2. **Dynamic Pools**: Creates and manages size-specific pools based on demand
3. **Auto-tuning**: Pre-allocates buffers for commonly requested sizes
4. **Memory Efficiency**: Minimizes wasted space by matching buffer sizes to actual needs

Enable adaptive sizing for optimal performance with variable-sized data:

```javascript
// Create a buffer pool with adaptive sizing
const adaptivePool = new BufferPool({
  adaptive: true,
  adaptiveInterval: 5000, // Check every 5 seconds
  minBufferSize: 1024,    // Smallest buffer: 1KB
  maxBufferSize: 1048576  // Largest buffer: 1MB
});

// Get statistics including adaptation metrics
const stats = adaptivePool.getStats();
console.log(`Adaptations: ${stats.adapts}`);
console.log(`Pool efficiency: ${(stats.efficiency * 100).toFixed(2)}%`);
console.log(`Current pools: ${stats.currentPools}`);
```

For workloads with consistent buffer sizes, you can disable adaptive sizing for simplicity:

```javascript
// Fixed-size pool for consistent workloads
const fixedPool = new BufferPool({
  adaptive: false,
  bufferSize: 16384 // Always use 16KB buffers
});
```

### Adaptive Features

### Adaptive Buffer Sizing

The `BufferPool` includes adaptive sizing capabilities that dynamically adjust buffer allocation based on workload:

```javascript
// Create a buffer pool with adaptive sizing
const adaptivePool = new BufferPool({
  minBufferSize: 4 * 1024,     // 4KB minimum
  maxBufferSize: 1024 * 1024,  // 1MB maximum
  initialPoolSize: 10,         // Start with 10 buffers
  growthFactor: 1.5,           // Grow by 50% when needed
  adaptiveScaling: true,       // Enable adaptive sizing
  usageThreshold: 0.7,         // Scale up when 70% of buffers are in use
  samplingInterval: 1000       // Adjust every second
});
```

The adaptive buffer sizing automatically scales the pool based on demand patterns, optimizing memory usage.

### Adaptive Timeouts

Nexure.js provides an `AdaptiveTimeoutManager` that intelligently adjusts timeout durations based on:

- Payload size and type
- Historical processing performance
- System load
- Processing complexity

To use adaptive timeouts with stream processing:

```javascript
// The stream transform middleware uses adaptive timeouts by default
app.use(streamTransform({
  transformers: [myTransformer],
  useAdaptiveTimeout: true // This is the default
}));

// To use a static timeout instead
app.use(streamTransform({
  transformers: [myTransformer],
  useAdaptiveTimeout: false,
  timeout: 30000 // 30 seconds static timeout
}));
```

Benefits of adaptive timeouts:

1. **Automatic adjustment** - Longer timeouts for larger payloads, shorter for small ones
2. **Learning from history** - Improves over time based on observed performance
3. **Load awareness** - Extends timeouts during high system load
4. **Progress tracking** - Can extend timeouts as processing progresses

You can also use the timeout manager directly:

```javascript
import { globalTimeoutManager } from 'nexure/utils/adaptive-timeout';

// Create a timeout handler for a specific operation
const timeoutHandler = globalTimeoutManager.createTimeoutHandler({
  size: contentLength,
  contentType: 'application/json',
  operation: 'processUpload',
  onTimeout: () => {
    console.error('Operation timed out');
    // Cleanup resources
  }
});

// Start the timeout
timeoutHandler.start();

// As processing progresses, extend the timeout
function onProgress(bytesProcessed, totalBytes) {
  if (bytesProcessed % (1024 * 1024) === 0) { // Every 1MB
    timeoutHandler.extend(10); // Extend by 10%
  }
}

// When finished, clear the timeout and record stats
function onComplete() {
  timeoutHandler.clear(true); // true = successful completion
}

// If an error occurs
function onError() {
  timeoutHandler.clear(false); // false = unsuccessful
}
```

See the [adaptive timeout example](../examples/adaptive-timeout-example.js) for more details.

### OptimizedTransform

The `OptimizedTransform` class extends Node.js Transform streams with buffer pooling:

```javascript
import { createOptimizedTransform } from 'nexurejs/utils/stream-optimizer.js';

const transformer = createOptimizedTransform({
  transform(chunk, encoding, callback) {
    // Get a buffer from the pool (automatically managed)
    const pooledBuffer = globalPool.acquire(chunk.length);

    // Process the data using the pooled buffer
    chunk.copy(pooledBuffer);
    for (let i = 0; i < pooledBuffer.length; i++) {
      pooledBuffer[i] = transform(pooledBuffer[i]);
    }

    // Pass it downstream
    callback(null, pooledBuffer);

    // Release buffer after it's been pushed downstream
    process.nextTick(() => {
      globalPool.release(pooledBuffer);
    });
  }
});

// Use it in a pipeline
await pipeline(source, transformer, destination);
```

### Specialized Transformers

For common use cases, Nexure.js provides pre-configured optimized transformers:

```javascript
import {
  createJsonTransformer,
  createTextTransformer,
  createBinaryTransformer
} from 'nexurejs/utils/stream-optimizer.js';

// JSON processing
const jsonTransformer = createJsonTransformer({
  processJson: (data) => {
    // Transform JSON data
    data.processed = true;
    data.timestamp = new Date();
    return data;
  },
  streamArrayItems: true // Process large arrays incrementally
});

// Text processing
const textTransformer = createTextTransformer({
  processText: (text) => {
    return text.toUpperCase();
  },
  chunkSize: 8192 // Process in 8KB chunks
});

// Binary data processing
const binaryTransformer = createBinaryTransformer({
  processBinary: (buffer) => {
    // Perform operations on binary data
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = buffer[i] ^ 0x55; // XOR transformation
    }
    return buffer;
  }
});
```

## Middleware Integration

Nexure.js provides middleware that leverages these optimized components:

```javascript
import {
  streamTransform,
  createTextProcessor,
  createJsonProcessor
} from 'nexurejs/middleware/stream-transform.js';

// Create an Express/Nexure app
const app = createApp();

// Apply middleware for transforming request bodies
app.use(streamTransform({
  transformers: [
    // Create a custom transformer
    createJsonProcessor({
      processJson: (data) => {
        data.server_timestamp = Date.now();
        return data;
      }
    })
  ],
  useOptimized: true, // Use buffer pooling (default)
  timeout: 5000 // Set a 5-second timeout
}));

// Apply to specific routes
app.post('/api/data', streamTransform({
  transformers: [
    createTextProcessor({
      processText: (text) => {
        return text.replace(/sensitive/g, '[REDACTED]');
      }
    })
  ]
}), (req, res) => {
  // Handle the transformed request
  res.send({ success: true });
});
```

## Body Parser Integration

The optimized streaming components are integrated with the body parser:

```javascript
import { bodyParser } from 'nexurejs/http/body-parser.js';

// Use the body parser with optimized streaming
app.use(bodyParser({
  maxBufferSize: 1024 * 1024, // 1MB - Buffer in memory if smaller
  alwaysStream: false,        // Force streaming for all requests
  streamChunkSize: 16 * 1024, // 16KB chunks for optimal performance
  maxBodySize: 100 * 1024 * 1024 // 100MB maximum request size
}));
```

## Performance Tips

For maximum performance when working with Nexure.js streams:

1. **Reuse buffers**: Always return buffers to the pool when done with them.
2. **Set appropriate chunk sizes**: Usually 8-64KB works best.
3. **Avoid unnecessary allocations**: Use pooled buffers whenever possible.
4. **Process incrementally**: For large JSON arrays, use `streamArrayItems: true`.
5. **Set timeouts**: Always set reasonable timeouts for stream processing.
6. **Monitor memory usage**: Use `globalPool.getStats()` to monitor buffer utilization.

## Benchmarking

To evaluate the performance of optimized streams in your application:

```javascript
npm run profile:benchmark
```

This runs a comprehensive benchmark comparing standard Node.js streams with optimized streams.

## Example: File Upload Processing

```javascript
import { streamTransform } from 'nexurejs/middleware/stream-transform.js';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Create a file upload handler with optimized processing
app.post('/upload', async (req, res) => {
  const outputPath = `/tmp/uploads/${Date.now()}.processed`;

  try {
    // Process the uploaded file with optimized streams
    await pipeline(
      req,
      streamTransform({
        transformers: [
          // Apply transformations to the uploaded data
          createBinaryTransformer({
            processBinary: (chunk) => {
              // Process each chunk (e.g., image manipulation, encryption)
              return processChunk(chunk);
            }
          })
        ]
      }),
      createWriteStream(outputPath)
    );

    res.json({ success: true, outputPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## Conclusion

By leveraging Nexure.js's optimized stream processing components, you can build high-performance applications that efficiently handle large volumes of data with minimal memory overhead. The buffer pooling system drastically reduces GC pressure, resulting in more stable performance and better resource utilization.

For more information, see the [Performance Optimization Guide](./performance-optimization.md).
