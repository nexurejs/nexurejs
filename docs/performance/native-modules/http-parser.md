# HTTP Parser Native Module

## Overview

The HTTP Parser is a high-performance C++ implementation of an HTTP request parser. It provides significant performance improvements over JavaScript-based alternatives by leveraging optimized C++ code for parsing HTTP requests.

## Features

- Fast parsing of HTTP request headers, method, path, and body
- Support for standard HTTP methods (GET, POST, PUT, DELETE, etc.)
- Header parsing with case-insensitive header names
- Efficient body extraction based on content length
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor()
```

Creates a new instance of the HTTP Parser. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

### Methods

#### `parse(buffer: Buffer): HttpParseResult`

Parses an HTTP request buffer and returns the parsed result.

**Parameters:**
- `buffer: Buffer` - The raw HTTP request buffer

**Returns:**
```typescript
interface HttpParseResult {
  method: string;
  url: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  body?: Buffer;
  httpVersion: string;
}
```

#### `parseHeaders(buffer: Buffer): Record<string, string>`

Parses only the headers from an HTTP request buffer.

**Parameters:**
- `buffer: Buffer` - The raw HTTP request buffer

**Returns:**
- `Record<string, string>` - Object containing header names and values

#### `parseBody(buffer: Buffer, contentLength: number): Buffer`

Extracts the body from an HTTP request buffer based on the specified content length.

**Parameters:**
- `buffer: Buffer` - The raw HTTP request buffer
- `contentLength: number` - The length of the body as specified in Content-Length header

**Returns:**
- `Buffer` - The extracted body as a Buffer

#### `reset(): void`

Resets the parser state, allowing it to be reused for parsing another request.

### Static Methods

#### `getPerformanceMetrics(): { jsTime: number; jsCount: number; nativeTime: number; nativeCount: number }`

Returns performance metrics for both JavaScript and native implementations.

**Returns:**
- `jsTime` - Total time spent in JavaScript parser (ms)
- `jsCount` - Number of times JavaScript parser was used
- `nativeTime` - Total time spent in native parser (ms)
- `nativeCount` - Number of times native parser was used

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The HTTP Parser native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. The implementation uses a streaming approach to efficiently parse HTTP requests without excessive memory allocation.

## C++ Implementation Explained

### Core Classes and Methods

#### `HttpParser` Class

This is the main C++ class that encapsulates the HTTP parsing functionality. The key methods include:

```cpp
class HttpParser : public Napi::ObjectWrap<HttpParser> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  HttpParser(const Napi::CallbackInfo& info);

private:
  // Main parsing method
  Napi::Value Parse(const Napi::CallbackInfo& info);

  // Helper methods
  Napi::Value ParseHeaders(const Napi::CallbackInfo& info);
  Napi::Value ParseBody(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);

  // Performance metrics tracking
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // Internal parsing implementation
  HttpParseResult ParseInternal(const char* data, size_t length);
  HeaderMap ParseHeadersInternal(const char* data, size_t length);
  Buffer ParseBodyInternal(const char* data, size_t length, size_t contentLength);

  // Parser state
  ParserState state_;
  static PerformanceMetrics metrics_;
};
```

#### State Management

The parser uses a state machine to track the parsing progress:

```cpp
enum class ParserState {
  Start,
  Method,
  Url,
  HttpVersion,
  HeaderName,
  HeaderValue,
  Body,
  Complete,
  Error
};
```

### Parsing Algorithm

The HTTP parser implements a single-pass streaming algorithm that processes the HTTP request byte by byte. The algorithm works as follows:

1. **Request Line Parsing**:
   ```cpp
   // Simplified example of method parsing
   void ParseMethod(const char* data, size_t length, size_t& position) {
     size_t start = position;
     while (position < length && data[position] != ' ') {
       position++;
     }

     // Extract method string
     method_ = std::string(data + start, position - start);
     position++; // Skip space
     state_ = ParserState::Url; // Move to URL parsing
   }
   ```

2. **Header Parsing**:
   ```cpp
   // Case-insensitive header name comparison
   bool IsHeaderNameEqual(const std::string& a, const std::string& b) {
     if (a.length() != b.length()) return false;

     for (size_t i = 0; i < a.length(); i++) {
       if (std::tolower(a[i]) != std::tolower(b[i])) return false;
     }

     return true;
   }

   // Header parsing implementation
   HeaderMap ParseHeadersInternal(const char* data, size_t length) {
     HeaderMap headers;
     size_t position = 0;
     std::string name, value;

     // State machine for header parsing
     while (position < length) {
       // Parse header name
       size_t nameStart = position;
       while (position < length && data[position] != ':') position++;
       name = std::string(data + nameStart, position - nameStart);

       // Skip colon and whitespace
       position++;
       while (position < length && data[position] == ' ') position++;

       // Parse header value
       size_t valueStart = position;
       while (position < length &&
              !(data[position] == '\r' && position + 1 < length && data[position + 1] == '\n')) {
         position++;
       }
       value = std::string(data + valueStart, position - valueStart);

       // Store header
       headers[name] = value;

       // Skip CRLF
       position += 2;

       // Check for end of headers (empty line)
       if (position + 1 < length && data[position] == '\r' && data[position + 1] == '\n') {
         position += 2;
         break;
       }
     }

     return headers;
   }
   ```

3. **Body Extraction**:
   ```cpp
   // Body parsing based on Content-Length
   Buffer ParseBodyInternal(const char* data, size_t length, size_t contentLength) {
     // Find the end of headers (double CRLF)
     const char* endOfHeaders = FindEndOfHeaders(data, length);
     if (!endOfHeaders) return Buffer(); // No body found

     // Calculate body position
     size_t bodyOffset = (endOfHeaders - data) + 4; // +4 for the double CRLF

     // Extract body based on Content-Length
     size_t bodySize = std::min(contentLength, length - bodyOffset);

     // Create buffer with body content
     return Buffer::Copy(data + bodyOffset, bodySize);
   }
   ```

### Memory Management

The HTTP parser implementation is careful with memory management to avoid leaks and unnecessary allocations:

1. **Zero-copy where possible**: The parser attempts to avoid copying data by using views into the original buffer where possible.

2. **Smart buffer allocation**: For body extraction, the implementation allocates exactly the required size.

3. **RAII principles**: The implementation follows Resource Acquisition Is Initialization principles for automatic cleanup of resources.

```cpp
// Example of efficient buffer handling with RAII
class BufferScope {
public:
  BufferScope(size_t size) : data_(new char[size]), size_(size) {}
  ~BufferScope() { delete[] data_; }

  char* data() { return data_; }
  size_t size() { return size_; }

private:
  char* data_;
  size_t size_;

  // Prevent copying
  BufferScope(const BufferScope&) = delete;
  BufferScope& operator=(const BufferScope&) = delete;
};
```

### N-API Integration

The HTTP parser module integrates with Node.js using N-API (Node-API) for ABI stability:

```cpp
// Module initialization
Napi::Object HttpParser::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "HttpParser", {
    InstanceMethod("parse", &HttpParser::Parse),
    InstanceMethod("parseHeaders", &HttpParser::ParseHeaders),
    InstanceMethod("parseBody", &HttpParser::ParseBody),
    InstanceMethod("reset", &HttpParser::Reset),
    StaticMethod("getPerformanceMetrics", &HttpParser::GetPerformanceMetrics),
    StaticMethod("resetPerformanceMetrics", &HttpParser::ResetPerformanceMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("HttpParser", func);
  return exports;
}

// Convert parsed result to JavaScript object
Napi::Value HttpParser::Parse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get buffer data
  Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();

  // Measure performance
  auto start = std::chrono::high_resolution_clock::now();

  // Parse HTTP request
  HttpParseResult result = ParseInternal(buffer.Data(), buffer.Length());

  // Record performance metrics
  auto end = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
  metrics_.nativeTime += duration.count() / 1000.0; // Convert to milliseconds
  metrics_.nativeCount++;

  // Convert result to JavaScript object
  Napi::Object jsResult = Napi::Object::New(env);
  jsResult.Set("method", Napi::String::New(env, result.method));
  jsResult.Set("url", Napi::String::New(env, result.url));
  jsResult.Set("httpVersion", Napi::String::New(env, result.httpVersion));

  // Convert headers to JavaScript object
  Napi::Object jsHeaders = Napi::Object::New(env);
  for (const auto& header : result.headers) {
    jsHeaders.Set(header.first, Napi::String::New(env, header.second));
  }
  jsResult.Set("headers", jsHeaders);

  // Convert raw headers to JavaScript array
  Napi::Array jsRawHeaders = Napi::Array::New(env, result.rawHeaders.size());
  for (size_t i = 0; i < result.rawHeaders.size(); i++) {
    jsRawHeaders[i] = Napi::String::New(env, result.rawHeaders[i]);
  }
  jsResult.Set("rawHeaders", jsRawHeaders);

  // Set body if present
  if (result.body.data) {
    jsResult.Set("body", Napi::Buffer<char>::Copy(
      env, result.body.data, result.body.length));
  }

  return jsResult;
}
```

### Performance Optimizations

Several optimizations enhance the HTTP parser's performance:

1. **Single-pass parsing**: The parser processes the HTTP request in a single pass to minimize iteration over the data.

2. **Minimal memory allocations**: The implementation minimizes memory allocations and copies, especially for large requests.

3. **Case-insensitive header comparison**: Efficient implementation of case-insensitive header name comparison.

4. **Fast string operations**: Low-level string operations are used instead of regular expressions for better performance.

5. **State machine optimization**: The state machine is designed to minimize state transitions and handle common cases efficiently.

6. **Buffer pooling**: For applications with many requests, the parser can reuse buffers to reduce memory allocations.

```cpp
// Example of optimized case-insensitive header comparison
bool FastCaseInsensitiveCompare(const char* a, size_t a_len, const char* b, size_t b_len) {
  if (a_len != b_len) return false;

  for (size_t i = 0; i < a_len; i++) {
    // Fast ASCII case conversion using bitwise operations
    char a_lower = a[i] | 0x20; // Convert to lowercase if uppercase letter
    char b_lower = b[i] | 0x20;

    if (a_lower != b_lower) return false;
  }

  return true;
}
```

## Performance Considerations

- The native implementation is significantly faster than the JavaScript implementation, especially for large requests with many headers
- The module automatically measures and tracks performance metrics for both implementations
- For very small requests, the overhead of crossing the JavaScript/C++ boundary might reduce the performance advantage

## Examples

### Basic Usage

```typescript
import { HttpParser } from 'nexurejs';

// Create a new parser instance
const parser = new HttpParser();

// Parse an HTTP request
const requestBuffer = Buffer.from('GET /api/users HTTP/1.1\r\nHost: example.com\r\nAccept: */*\r\n\r\n');
const result = parser.parse(requestBuffer);

console.log(result.method);     // 'GET'
console.log(result.url);        // '/api/users'
console.log(result.headers);    // { host: 'example.com', accept: '*/*' }
console.log(result.httpVersion); // '1.1'

// Reset the parser for reuse
parser.reset();
```

### Performance Monitoring

```typescript
import { HttpParser } from 'nexurejs';

// Get performance metrics
const metrics = HttpParser.getPerformanceMetrics();
console.log(`Native parser: ${metrics.nativeCount} calls in ${metrics.nativeTime}ms`);
console.log(`JS parser: ${metrics.jsCount} calls in ${metrics.jsTime}ms`);

// Reset metrics
HttpParser.resetPerformanceMetrics();
```
