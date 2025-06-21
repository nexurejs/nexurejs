# Compression Native Module

## Overview

The Compression module is a high-performance C++ implementation for data compression and decompression. It provides significantly faster compression compared to JavaScript implementations, with support for various compression algorithms including Brotli, Gzip, and Deflate.

## Features

- Fast compression and decompression using C++ implementations
- Support for multiple compression formats (Brotli, Gzip, Deflate)
- Configurable compression levels
- Streaming API for processing large data
- Memory-efficient implementation
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor(options?: { defaultFormat?: 'brotli' | 'gzip' | 'deflate' })
```

Creates a new instance of the Compression module. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

**Parameters:**
- `options.defaultFormat` - Default compression format to use (default: 'brotli')

### Methods

#### `compress(data: Buffer | string, options?: CompressionOptions): Buffer`

Compresses data using the specified or default compression format.

**Parameters:**
- `data: Buffer | string` - Data to compress
- `options?: CompressionOptions` - Compression options:
  - `format?: 'brotli' | 'gzip' | 'deflate'` - Compression format (default: constructor default)
  - `level?: number` - Compression level (1-9 for gzip/deflate, 1-11 for brotli)
  - `dictionary?: Buffer` - Optional preset dictionary (for formats that support it)

**Returns:**
- `Buffer` - Compressed data

**Throws:**
- Error if compression fails

#### `decompress(data: Buffer, options?: DecompressionOptions): Buffer`

Decompresses data using the specified or detected compression format.

**Parameters:**
- `data: Buffer` - Data to decompress
- `options?: DecompressionOptions` - Decompression options:
  - `format?: 'brotli' | 'gzip' | 'deflate' | 'auto'` - Compression format (default: 'auto')
  - `dictionary?: Buffer` - Optional preset dictionary (for formats that support it)

**Returns:**
- `Buffer` - Decompressed data

**Throws:**
- Error if decompression fails or format detection fails

#### `createCompressStream(options?: CompressionOptions): Transform`

Creates a transform stream for compression.

**Parameters:**
- `options?: CompressionOptions` - Compression options (same as compress method)

**Returns:**
- `Transform` - Transform stream that compresses data

#### `createDecompressStream(options?: DecompressionOptions): Transform`

Creates a transform stream for decompression.

**Parameters:**
- `options?: DecompressionOptions` - Decompression options (same as decompress method)

**Returns:**
- `Transform` - Transform stream that decompresses data

### Static Methods

#### `getPerformanceMetrics(): { jsTime: number; jsCount: number; nativeTime: number; nativeCount: number }`

Returns performance metrics for both JavaScript and native implementations.

**Returns:**
- `jsTime` - Total time spent in JavaScript compressor/decompressor (ms)
- `jsCount` - Number of times JavaScript implementation was used
- `nativeTime` - Total time spent in native compressor/decompressor (ms)
- `nativeCount` - Number of times native implementation was used

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The Compression native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. The module uses the Brotli, Zlib, and other compression libraries for high-performance data compression.

## C++ Implementation Explained

### Core Classes and Methods

#### `CompressionModule` Class

This is the main C++ class that handles data compression and decompression:

```cpp
class CompressionModule : public Napi::ObjectWrap<CompressionModule> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  CompressionModule(const Napi::CallbackInfo& info);

private:
  // JavaScript-facing methods
  Napi::Value Compress(const Napi::CallbackInfo& info);
  Napi::Value Decompress(const Napi::CallbackInfo& info);
  Napi::Value CreateCompressStream(const Napi::CallbackInfo& info);
  Napi::Value CreateDecompressStream(const Napi::CallbackInfo& info);

  // Performance metrics
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // Internal implementation methods
  Buffer CompressBrotli(const uint8_t* data, size_t size, int level);
  Buffer CompressGzip(const uint8_t* data, size_t size, int level);
  Buffer CompressDeflate(const uint8_t* data, size_t size, int level);

  Buffer DecompressBrotli(const uint8_t* data, size_t size);
  Buffer DecompressGzip(const uint8_t* data, size_t size);
  Buffer DecompressDeflate(const uint8_t* data, size_t size);

  std::string DetectCompressionFormat(const uint8_t* data, size_t size);

  // Stream implementation helpers
  static void StreamCompressWorker(const Napi::Env& env, Napi::AsyncContext* context,
                                  std::shared_ptr<StreamContext> ctx);
  static void StreamDecompressWorker(const Napi::Env& env, Napi::AsyncContext* context,
                                    std::shared_ptr<StreamContext> ctx);

  // Module state
  std::string defaultFormat_;
  static PerformanceMetrics metrics_;
};
```

### Compression Implementation

The module implements various compression algorithms:

#### Brotli Compression

```cpp
Buffer CompressionModule::CompressBrotli(const uint8_t* data, size_t size, int level) {
  // Create a compressed buffer
  size_t maxCompressedSize = BrotliEncoderMaxCompressedSize(size);
  if (maxCompressedSize == 0) {
    throw std::runtime_error("Failed to calculate maximum compressed size");
  }

  std::unique_ptr<uint8_t[]> compressedBuffer(new uint8_t[maxCompressedSize]);
  size_t compressedSize = maxCompressedSize;

  // Configure encoder parameters
  BrotliEncoderState* state = BrotliEncoderCreateInstance(nullptr, nullptr, nullptr);
  if (!state) {
    throw std::runtime_error("Failed to create Brotli encoder instance");
  }

  // Set quality level (0-11, with 11 being highest quality/slowest)
  BrotliEncoderSetParameter(state, BROTLI_PARAM_QUALITY, level);

  // Compress
  BrotliEncoderResult result = BrotliEncoderCompress(
    state,
    size, data,
    &compressedSize, compressedBuffer.get()
  );

  // Clean up
  BrotliEncoderDestroyInstance(state);

  if (result != BROTLI_TRUE) {
    throw std::runtime_error("Brotli compression failed");
  }

  // Create a buffer with the exact compressed size
  Buffer compressedData(compressedSize);
  std::memcpy(compressedData.data, compressedBuffer.get(), compressedSize);

  return compressedData;
}
```

#### Gzip Compression

```cpp
Buffer CompressionModule::CompressGzip(const uint8_t* data, size_t size, int level) {
  // Initialize zlib
  z_stream zs;
  std::memset(&zs, 0, sizeof(zs));

  // Set up compression level
  if (deflateInit2(&zs, level, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
    throw std::runtime_error("Failed to initialize zlib for Gzip compression");
  }

  // Set up input
  zs.next_in = const_cast<uint8_t*>(data);
  zs.avail_in = size;

  // Estimate output size
  size_t outBufferSize = deflateBound(&zs, size);
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outBufferSize]);

  // Set up output
  zs.next_out = outBuffer.get();
  zs.avail_out = outBufferSize;

  // Compress
  int result = deflate(&zs, Z_FINISH);
  deflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Gzip compression failed");
  }

  // Create a buffer with the exact compressed size
  size_t compressedSize = outBufferSize - zs.avail_out;
  Buffer compressedData(compressedSize);
  std::memcpy(compressedData.data, outBuffer.get(), compressedSize);

  return compressedData;
}
```

#### Deflate Compression

```cpp
Buffer CompressionModule::CompressDeflate(const uint8_t* data, size_t size, int level) {
  // Initialize zlib
  z_stream zs;
  std::memset(&zs, 0, sizeof(zs));

  // Set up compression level
  if (deflateInit(&zs, level) != Z_OK) {
    throw std::runtime_error("Failed to initialize zlib for Deflate compression");
  }

  // Set up input
  zs.next_in = const_cast<uint8_t*>(data);
  zs.avail_in = size;

  // Estimate output size
  size_t outBufferSize = deflateBound(&zs, size);
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outBufferSize]);

  // Set up output
  zs.next_out = outBuffer.get();
  zs.avail_out = outBufferSize;

  // Compress
  int result = deflate(&zs, Z_FINISH);
  deflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Deflate compression failed");
  }

  // Create a buffer with the exact compressed size
  size_t compressedSize = outBufferSize - zs.avail_out;
  Buffer compressedData(compressedSize);
  std::memcpy(compressedData.data, outBuffer.get(), compressedSize);

  return compressedData;
}
```

### Decompression Implementation

The module implements decompression for each supported format:

#### Brotli Decompression

```cpp
Buffer CompressionModule::DecompressBrotli(const uint8_t* data, size_t size) {
  // Create a decompression state
  BrotliDecoderState* state = BrotliDecoderCreateInstance(nullptr, nullptr, nullptr);
  if (!state) {
    throw std::runtime_error("Failed to create Brotli decoder instance");
  }

  // First calculate decompressed size
  size_t decompressedSize = 0;
  BrotliDecoderResult result;

  // Try to decompress with a growing buffer
  const size_t kBufferBlockSize = 16384;  // 16KB blocks
  std::vector<uint8_t> outputBuffer;

  size_t availableIn = size;
  const uint8_t* nextIn = data;

  while (true) {
    // Grow the buffer
    size_t oldSize = outputBuffer.size();
    outputBuffer.resize(oldSize + kBufferBlockSize);

    size_t availableOut = kBufferBlockSize;
    uint8_t* nextOut = outputBuffer.data() + oldSize;

    result = BrotliDecoderDecompressStream(
      state,
      &availableIn, &nextIn,
      &availableOut, &nextOut,
      nullptr  // Total output
    );

    decompressedSize += (kBufferBlockSize - availableOut);

    if (result == BROTLI_DECODER_RESULT_SUCCESS) {
      // Finished successfully
      break;
    } else if (result == BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT) {
      // Need more output buffer space, continue
      continue;
    } else {
      // Error or needs more input (which shouldn't happen for complete input)
      BrotliDecoderDestroyInstance(state);
      throw std::runtime_error("Brotli decompression failed");
    }
  }

  // Resize the final buffer to the exact size
  outputBuffer.resize(decompressedSize);

  // Clean up
  BrotliDecoderDestroyInstance(state);

  // Create a buffer with the decompressed data
  Buffer decompressedData(decompressedSize);
  std::memcpy(decompressedData.data, outputBuffer.data(), decompressedSize);

  return decompressedData;
}
```

#### Gzip Decompression

```cpp
Buffer CompressionModule::DecompressGzip(const uint8_t* data, size_t size) {
  // Initialize zlib
  z_stream zs;
  std::memset(&zs, 0, sizeof(zs));

  // Set window bits to handle gzip format
  if (inflateInit2(&zs, 15 + 16) != Z_OK) {
    throw std::runtime_error("Failed to initialize zlib for Gzip decompression");
  }

  // Set up input
  zs.next_in = const_cast<uint8_t*>(data);
  zs.avail_in = size;

  // Try to decompress with a growing buffer
  const size_t kBufferBlockSize = 16384;  // 16KB blocks
  std::vector<uint8_t> outputBuffer;
  size_t totalOutput = 0;

  int result;
  do {
    // Grow the buffer
    size_t oldSize = outputBuffer.size();
    outputBuffer.resize(oldSize + kBufferBlockSize);

    // Set up output pointer to the new block
    zs.next_out = outputBuffer.data() + oldSize;
    zs.avail_out = kBufferBlockSize;

    // Decompress
    result = inflate(&zs, Z_FINISH);

    // Update total output size
    totalOutput += (kBufferBlockSize - zs.avail_out);

    // Check if we need more output space
  } while (result == Z_OK);

  // Clean up
  inflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Gzip decompression failed");
  }

  // Resize the final buffer to the exact size
  outputBuffer.resize(totalOutput);

  // Create a buffer with the decompressed data
  Buffer decompressedData(totalOutput);
  std::memcpy(decompressedData.data, outputBuffer.data(), totalOutput);

  return decompressedData;
}
```

#### Deflate Decompression

```cpp
Buffer CompressionModule::DecompressDeflate(const uint8_t* data, size_t size) {
  // Initialize zlib
  z_stream zs;
  std::memset(&zs, 0, sizeof(zs));

  // Set up decompression
  if (inflateInit(&zs) != Z_OK) {
    throw std::runtime_error("Failed to initialize zlib for Deflate decompression");
  }

  // Set up input
  zs.next_in = const_cast<uint8_t*>(data);
  zs.avail_in = size;

  // Try to decompress with a growing buffer
  const size_t kBufferBlockSize = 16384;  // 16KB blocks
  std::vector<uint8_t> outputBuffer;
  size_t totalOutput = 0;

  int result;
  do {
    // Grow the buffer
    size_t oldSize = outputBuffer.size();
    outputBuffer.resize(oldSize + kBufferBlockSize);

    // Set up output pointer to the new block
    zs.next_out = outputBuffer.data() + oldSize;
    zs.avail_out = kBufferBlockSize;

    // Decompress
    result = inflate(&zs, Z_FINISH);

    // Update total output size
    totalOutput += (kBufferBlockSize - zs.avail_out);

    // Check if we need more output space
  } while (result == Z_OK);

  // Clean up
  inflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Deflate decompression failed");
  }

  // Resize the final buffer to the exact size
  outputBuffer.resize(totalOutput);

  // Create a buffer with the decompressed data
  Buffer decompressedData(totalOutput);
  std::memcpy(decompressedData.data, outputBuffer.data(), totalOutput);

  return decompressedData;
}
```

### Format Detection

The module can automatically detect the compression format:

```cpp
std::string CompressionModule::DetectCompressionFormat(const uint8_t* data, size_t size) {
  if (size < 2) {
    throw std::runtime_error("Input too small to detect compression format");
  }

  // Check for Gzip magic bytes
  if (data[0] == 0x1F && data[1] == 0x8B) {
    return "gzip";
  }

  // Check for Brotli signature (unofficial but common)
  if ((data[0] == 0xCE || data[0] == 0xCF) && data[1] == 0xB3) {
    return "brotli";
  }

  // Try to detect Deflate
  // Deflate doesn't have an official header, but the first byte
  // of a zlib stream starts with 0x78 (CMF byte)
  if (data[0] == 0x78 && (data[1] == 0x01 || data[1] == 0x9C || data[1] == 0xDA)) {
    return "deflate";
  }

  // Could not detect format
  throw std::runtime_error("Unknown compression format");
}
```

### Streaming Implementation

The module provides streaming support for compression and decompression:

```cpp
Napi::Value CompressionModule::CreateCompressStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Parse options
  std::string format = defaultFormat_;
  int level = 9;  // Default level

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("format") && options.Get("format").IsString()) {
      format = options.Get("format").As<Napi::String>().Utf8Value();
    }

    if (options.Has("level") && options.Get("level").IsNumber()) {
      level = options.Get("level").As<Napi::Number>().Int32Value();
    }
  }

  // Validate level
  if (format == "brotli") {
    level = std::max(0, std::min(level, 11));  // Brotli: 0-11
  } else {
    level = std::max(1, std::min(level, 9));  // Gzip/Deflate: 1-9
  }

  // Create transform stream
  Napi::Function transformClass = GetTransformClass(env);
  Napi::Object streamOptions = Napi::Object::New(env);

  // Set up transform stream with compression context
  std::shared_ptr<StreamContext> ctx = std::make_shared<StreamContext>();
  ctx->format = format;
  ctx->level = level;

  // Initialize compression state based on format
  if (format == "brotli") {
    ctx->brotliState = BrotliEncoderCreateInstance(nullptr, nullptr, nullptr);
    BrotliEncoderSetParameter(ctx->brotliState, BROTLI_PARAM_QUALITY, level);
  } else if (format == "gzip") {
    ctx->zlibState = new z_stream();
    std::memset(ctx->zlibState, 0, sizeof(z_stream));
    deflateInit2(ctx->zlibState, level, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY);
  } else if (format == "deflate") {
    ctx->zlibState = new z_stream();
    std::memset(ctx->zlibState, 0, sizeof(z_stream));
    deflateInit(ctx->zlibState, level);
  } else {
    Napi::TypeError::New(env, "Invalid compression format").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Create transform stream with context
  auto asyncContext = new Napi::AsyncContext(env, "StreamCompressWorker");

  // Define transform function
  Napi::Function transformFn = Napi::Function::New(env, [ctx, asyncContext](const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Get chunk and callback
    Napi::Buffer<uint8_t> chunk = info[0].As<Napi::Buffer<uint8_t>>();
    Napi::Function callback = info[1].As<Napi::Function>();

    // Process chunk asynchronously
    ctx->inputBuffer = chunk.Data();
    ctx->inputSize = chunk.Length();

    StreamCompressWorker(env, asyncContext, ctx);

    // Call callback with compressed chunk
    callback.Call({env.Null(), Napi::Buffer<uint8_t>::Copy(env, ctx->outputBuffer.data(), ctx->outputSize)});
  });

  // Define flush function
  Napi::Function flushFn = Napi::Function::New(env, [ctx, asyncContext](const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Get callback
    Napi::Function callback = info[0].As<Napi::Function>();

    // Flush compression
    ctx->inputBuffer = nullptr;
    ctx->inputSize = 0;
    ctx->flushing = true;

    StreamCompressWorker(env, asyncContext, ctx);

    // Call callback with final chunk
    callback.Call({env.Null(), Napi::Buffer<uint8_t>::Copy(env, ctx->outputBuffer.data(), ctx->outputSize)});

    // Clean up
    if (ctx->format == "brotli") {
      BrotliEncoderDestroyInstance(ctx->brotliState);
    } else {
      deflateEnd(ctx->zlibState);
      delete ctx->zlibState;
    }

    delete asyncContext;
  });

  // Set transform and flush functions on options
  streamOptions.Set("transform", transformFn);
  streamOptions.Set("flush", flushFn);

  // Create and return transform stream
  return transformClass.New({streamOptions});
}
```

### Memory Management

The compression implementation uses efficient memory management:

1. **Smart Pointers**: The implementation uses `std::unique_ptr` for automatic memory cleanup:

```cpp
std::unique_ptr<uint8_t[]> compressedBuffer(new uint8_t[maxCompressedSize]);
```

2. **Buffer Reuse**: Temporary buffers are reused to minimize allocations:

```cpp
// Reuse output buffer for multiple operations
ctx->outputBuffer.resize(oldSize + kBufferBlockSize);
```

3. **Resource Cleanup**: All resources are properly cleaned up:

```cpp
// Clean up Brotli resources
BrotliEncoderDestroyInstance(state);

// Clean up zlib resources
inflateEnd(&zs);
```

4. **Efficient Memory Sizing**: The implementation estimates required buffer sizes to avoid reallocations:

```cpp
// Estimate output size
size_t outBufferSize = deflateBound(&zs, size);
```

5. **Block-based Processing**: The streaming implementation processes data in blocks to manage memory usage:

```cpp
// Process in 16KB blocks
const size_t kBufferBlockSize = 16384;
```

6. **Format Detection**: The implementation efficiently detects the compression format based on header signatures:

```cpp
// Check format signatures with minimal overhead
if (data[0] == 0x1F && data[1] == 0x8B) {
  return "gzip";
}
```

7. **Direct Buffer Access**: The implementation uses direct buffer access for zero-copy operations:

```cpp
// Direct buffer access to avoid copies
Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
data = buffer.Data();
```

8. **Streaming API**: The implementation provides a streaming interface for processing large data:

```cpp
// Transform streams for large data
Napi::Function transformFn = Napi::Function::New(env, [ctx, asyncContext](/*...*/));
```

## Performance Considerations

- The native implementation is significantly faster than JavaScript-based compression, especially for larger data
- Brotli typically provides better compression ratios than Gzip but is slower to compress (decompression is faster)
- For repeated compression of similar data, consider using a dictionary (for formats that support it)
- Higher compression levels provide better compression ratios but are slower to compute
- For streaming large data, use the streaming API rather than buffering everything in memory

## Examples

### Basic Compression and Decompression

```typescript
import { CompressionModule } from 'nexurejs';

// Create compressor instance
const compression = new CompressionModule();

// Compress some data
const originalData = 'Hello, world! '.repeat(1000);
const compressed = compression.compress(originalData, {
  format: 'brotli',
  level: 9
});

console.log(`Original size: ${originalData.length} bytes`);
console.log(`Compressed size: ${compressed.length} bytes`);
console.log(`Compression ratio: ${(compressed.length / originalData.length * 100).toFixed(2)}%`);

// Decompress the data
const decompressed = compression.decompress(compressed);
console.log(`Decompressed data matches original: ${originalData === decompressed.toString()}`);
```

### Streaming Compression

```typescript
import { CompressionModule } from 'nexurejs';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream';

// Create compressor instance
const compression = new CompressionModule();

// Compress a file using streams
const compressStream = compression.createCompressStream({
  format: 'gzip',
  level: 6
});

// Set up pipeline: read file -> compress -> write compressed file
pipeline(
  createReadStream('large-file.txt'),
  compressStream,
  createWriteStream('large-file.txt.gz'),
  (err) => {
    if (err) {
      console.error('Pipeline failed', err);
    } else {
      console.log('File successfully compressed');
    }
  }
);
```

### Compression Format Detection

```typescript
import { CompressionModule } from 'nexurejs';
import { readFileSync } from 'fs';

// Create compressor instance
const compression = new CompressionModule();

// Read a compressed file (could be any format)
const compressedData = readFileSync('unknown-format.bin');

try {
  // Auto-detect format and decompress
  const decompressed = compression.decompress(compressedData, { format: 'auto' });
  console.log(`Successfully decompressed ${compressedData.length} bytes to ${decompressed.length} bytes`);
  console.log(`First 100 chars: ${decompressed.toString().substring(0, 100)}...`);
} catch (error) {
  console.error('Failed to decompress:', error.message);
}
```

### Performance Comparison

```typescript
import { CompressionModule } from 'nexurejs';
import * as zlib from 'zlib';

// Create test data
const testData = Buffer.from('Test data '.repeat(100000));

// Native compression
const compression = new CompressionModule();
CompressionModule.resetPerformanceMetrics();

console.time('Native Gzip');
const nativeCompressed = compression.compress(testData, { format: 'gzip', level: 6 });
console.timeEnd('Native Gzip');

// Node.js built-in zlib
console.time('Node.js Gzip');
const nodeCompressed = zlib.gzipSync(testData, { level: 6 });
console.timeEnd('Node.js Gzip');

// Compare results
console.log(`Native compressed size: ${nativeCompressed.length} bytes`);
console.log(`Node.js compressed size: ${nodeCompressed.length} bytes`);

// Get performance metrics
const metrics = CompressionModule.getPerformanceMetrics();
console.log(`Native metrics: ${metrics.nativeCount} calls in ${metrics.nativeTime}ms`);
```
