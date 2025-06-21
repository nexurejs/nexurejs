# NexureJS Native Modules

## Overview

NexureJS includes a set of high-performance native modules implemented in C++ to provide significant performance improvements over JavaScript-based alternatives. These modules are automatically used when available and transparently fall back to JavaScript implementations when necessary.

The native modules are built using the Node-API (N-API) for stable ABI compatibility across Node.js versions, ensuring that they work reliably across different Node.js versions without requiring recompilation.

## Available Native Modules

NexureJS includes the following native modules:

1. [HTTP Parser](./http-parser.md) - Fast HTTP request parsing
2. [Radix Router](./radix-router.md) - High-performance HTTP routing using radix trees
3. [JSON Processor](./json-processor.md) - Fast JSON parsing and stringification using SimdJSON
4. [URL Parser](./url-parser.md) - Efficient URL and query string parsing
5. [Schema Validator](./schema-validator.md) - Fast JSON schema validation
6. [Compression](./compression.md) - Efficient data compression and decompression
7. [WebSocket](./websocket.md) - High-performance WebSocket server

Each module's documentation includes a detailed explanation of the C++ implementation, including key classes, methods, algorithms, memory management strategies, and performance optimizations.

## Common Features

All native modules share these common features:

- **Automatic Fallback**: If the native module is not available, the system automatically falls back to a JavaScript implementation with the same API.
- **Performance Metrics**: Each module tracks performance metrics for both native and JavaScript implementations.
- **Cross-Platform Support**: Pre-built binaries are available for common platforms (Windows, macOS, Linux).

## C++ Implementation Overview

The native modules are implemented using modern C++ with the following core characteristics:

- **NAPI Integration**: All modules use Node-API (N-API) for stable ABI compatibility across Node.js versions
- **Memory Management**: Careful attention to memory allocation/deallocation to prevent leaks and optimize performance
- **Exception Handling**: Robust error handling with proper conversion between C++ and JavaScript exceptions
- **Code Organization**: Clean class hierarchies with separation of concerns
- **Optimized Algorithms**: Specialized data structures and algorithms for maximum performance

## Configuration

You can configure the native modules using the `configureNativeModules` function:

```typescript
import { configureNativeModules } from 'nexurejs';

configureNativeModules({
  // Whether native modules are enabled (default: true)
  enabled: true,

  // Whether to log verbose information (default: false)
  verbose: false,

  // Path to the native module (default: auto-detected)
  modulePath: '/path/to/native/module',

  // Maximum size for route cache (default: 1000)
  maxCacheSize: 2000
});
```

## Status Information

You can get information about the status of native modules using the `getNativeModuleStatus` function:

```typescript
import { getNativeModuleStatus } from 'nexurejs';

const status = getNativeModuleStatus();
console.log(status);
// {
//   loaded: true,
//   httpParser: true,
//   radixRouter: true,
//   jsonProcessor: true,
//   urlParser: true,
//   schemaValidator: true,
//   compression: true,
//   webSocket: true
// }
```

## Performance Monitoring

NexureJS provides performance monitoring for all native modules:

```typescript
import { getAllPerformanceMetrics, resetAllPerformanceMetrics } from 'nexurejs';

// Get performance metrics for all modules
const metrics = getAllPerformanceMetrics();
console.log(metrics);

// Reset all performance metrics
resetAllPerformanceMetrics();
```

## Implementation Details

The native modules are implemented using:

- **C++17/20**: Modern C++ features for efficient code
- **Node-API (N-API)**: For stable ABI compatibility
- **SimdJSON**: Ultra-fast JSON parsing library
- **Optimized Algorithms**: Carefully designed algorithms for maximum performance
- **Smart Pointers**: RAII-based memory management to prevent leaks
- **Thread Safety**: Careful handling of asynchronous operations and thread synchronization where necessary

## Building from Source

If pre-built binaries are not available for your platform, you can build the native modules from source:

```bash
# Install development dependencies
npm install

# Build the native modules
npm run build:native
```

For more advanced build options:

```bash
# Build with debug information
NODE_ENV=development npm run build:native

# Build for all supported platforms (requires appropriate cross-compilation tools)
npm run build:native:all
```
