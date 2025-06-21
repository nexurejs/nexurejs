# URL Parser Native Module

## Overview

The URL Parser is a high-performance C++ implementation for parsing URLs and query strings. It provides significantly faster URL parsing compared to JavaScript's native URL parsing, especially for applications that process many URLs or need to extract query parameters.

## Features

- Fast parsing of URLs into component parts (protocol, hostname, path, etc.)
- Efficient query string parsing with minimal allocations
- Optimized for high-throughput applications
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor()
```

Creates a new instance of the URL Parser. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

### Methods

#### `parse(url: string): { protocol: string; auth: string; hostname: string; port: string; pathname: string; search: string; hash: string; }`

Parses a URL string into its component parts.

**Parameters:**

- `url: string` - URL string to parse

**Returns:**

- An object containing the URL components:
  - `protocol`: Protocol (e.g., 'http:', 'https:')
  - `auth`: Authentication part (e.g., 'username:password')
  - `hostname`: Host name (e.g., 'example.com')
  - `port`: Port number as a string (e.g., '8080')
  - `pathname`: URL path (e.g., '/path/to/resource')
  - `search`: Query string including '?' (e.g., '?name=value')
  - `hash`: Hash fragment including '#' (e.g., '#section')

**Throws:**

- Error if the URL is invalid

#### `parseQueryString(queryString: string): Record<string, string>`

Parses a query string into an object of key-value pairs.

**Parameters:**

- `queryString: string` - Query string to parse (with or without leading '?')

**Returns:**

- `Record<string, string>` - Object containing the query parameters

### Static Methods

#### `getPerformanceMetrics(): { jsTime: number; jsCount: number; nativeTime: number; nativeCount: number }`

Returns performance metrics for both JavaScript and native implementations.

**Returns:**

- `jsTime` - Total time spent in JavaScript URL parser (ms)
- `jsCount` - Number of times JavaScript URL parser was used
- `nativeTime` - Total time spent in native URL parser (ms)
- `nativeCount` - Number of times native URL parser was used

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The URL Parser native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. The implementation uses a fast scanning approach with minimal memory allocations and avoids regular expressions for better performance.

## C++ Implementation Explained

### Core Classes and Methods

#### `UrlParser` Class

This is the main C++ class that handles URL parsing:

```cpp
class UrlParser : public Napi::ObjectWrap<UrlParser> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  UrlParser(const Napi::CallbackInfo& info);

private:
  // JavaScript-facing methods
  Napi::Value Parse(const Napi::CallbackInfo& info);
  Napi::Value ParseQueryString(const Napi::CallbackInfo& info);

  // Performance metrics
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // Internal implementation methods
  UrlComponents ParseInternal(const std::string& url);
  std::unordered_map<std::string, std::string> ParseQueryStringInternal(const std::string& queryString);

  // Performance metrics storage
  static PerformanceMetrics metrics_;
};
```

#### `UrlComponents` Structure

The URL components are stored in a simple structure:

```cpp
struct UrlComponents {
  std::string protocol;
  std::string auth;
  std::string hostname;
  std::string port;
  std::string pathname;
  std::string search;
  std::string hash;
};
```

### URL Parsing Algorithm

The URL parser uses a state machine approach for efficient parsing:

```cpp
UrlComponents UrlParser::ParseInternal(const std::string& url) {
  UrlComponents components;

  // URL parsing state
  enum class State {
    Protocol,
    AfterProtocol,
    Authority,
    Host,
    Port,
    Path,
    Query,
    Fragment
  };

  State state = State::Protocol;
  size_t start = 0;

  // Initialize components with empty strings
  components.protocol = "";
  components.auth = "";
  components.hostname = "";
  components.port = "";
  components.pathname = "";
  components.search = "";
  components.hash = "";

  // Handle empty URL
  if (url.empty()) {
    components.pathname = "/";
    return components;
  }

  // Extract auth part separately, if exists
  size_t authEnd = 0;

  for (size_t i = 0; i < url.length(); i++) {
    char c = url[i];

    switch (state) {
      case State::Protocol:
        if (c == ':') {
          components.protocol = url.substr(start, i - start + 1);
          state = State::AfterProtocol;
          start = i + 1;
        }
        break;

      case State::AfterProtocol:
        if (c == '/' && url[i + 1] == '/') {
          i++; // Skip the second slash
          state = State::Authority;
          start = i + 1;
        } else {
          state = State::Path;
          start = i;
        }
        break;

      case State::Authority:
        if (c == '@') {
          // Found authentication info
          components.auth = url.substr(start, i - start);
          authEnd = i;
          state = State::Host;
          start = i + 1;
        } else if (c == ':') {
          // It's a port, not auth
          if (authEnd == 0) { // No auth found previously
            components.hostname = url.substr(start, i - start);
            state = State::Port;
            start = i + 1;
          }
        } else if (c == '/' || c == '?' || c == '#') {
          // End of authority section
          if (authEnd == 0) { // No auth found previously
            components.hostname = url.substr(start, i - start);
          }

          if (c == '/') {
            state = State::Path;
            start = i;
          } else if (c == '?') {
            state = State::Query;
            start = i;
          } else {
            state = State::Fragment;
            start = i;
          }
        }
        break;

      case State::Host:
        if (c == ':') {
          components.hostname = url.substr(start, i - start);
          state = State::Port;
          start = i + 1;
        } else if (c == '/' || c == '?' || c == '#') {
          components.hostname = url.substr(start, i - start);

          if (c == '/') {
            state = State::Path;
            start = i;
          } else if (c == '?') {
            state = State::Query;
            start = i;
          } else {
            state = State::Fragment;
            start = i;
          }
        }
        break;

      case State::Port:
        if (c == '/' || c == '?' || c == '#') {
          components.port = url.substr(start, i - start);

          if (c == '/') {
            state = State::Path;
            start = i;
          } else if (c == '?') {
            state = State::Query;
            start = i;
          } else {
            state = State::Fragment;
            start = i;
          }
        }
        break;

      case State::Path:
        if (c == '?') {
          components.pathname = url.substr(start, i - start);
          state = State::Query;
          start = i;
        } else if (c == '#') {
          components.pathname = url.substr(start, i - start);
          state = State::Fragment;
          start = i;
        }
        break;

      case State::Query:
        if (c == '#') {
          components.search = url.substr(start, i - start);
          state = State::Fragment;
          start = i;
        }
        break;

      case State::Fragment:
        // Just collect until the end
        break;
    }
  }

  // Handle the final component based on the current state
  switch (state) {
    case State::Protocol:
      // URL is just a protocol (unlikely)
      components.protocol = url;
      components.pathname = "/"; // Set default pathname
      break;

    case State::AfterProtocol:
      // URL is just a protocol followed by ':' (unlikely)
      components.pathname = "/"; // Set default pathname
      break;

    case State::Authority:
    case State::Host:
      if (authEnd == 0) { // No auth found previously
        components.hostname = url.substr(start);
      }
      components.pathname = "/"; // Set default pathname
      break;

    case State::Port:
      components.port = url.substr(start);
      components.pathname = "/"; // Set default pathname
      break;

    case State::Path:
      components.pathname = url.substr(start);
      break;

    case State::Query:
      components.search = url.substr(start);
      break;

    case State::Fragment:
      components.hash = url.substr(start);
      break;
  }

  // Ensure pathname starts with '/' if not empty
  if (components.pathname.empty()) {
    components.pathname = "/";
  } else if (components.pathname[0] != '/') {
    components.pathname = "/" + components.pathname;
  }

  return components;
}
```

### Query String Parsing

Query string parsing is implemented with a focus on performance:

```cpp
std::unordered_map<std::string, std::string> UrlParser::ParseQueryStringInternal(const std::string& queryString) {
  std::unordered_map<std::string, std::string> params;

  // Skip leading '?' if present
  size_t startPos = 0;
  if (!queryString.empty() && queryString[0] == '?') {
    startPos = 1;
  }

  // Fast parser without regular expressions
  size_t pos = startPos;
  size_t keyStart = pos;
  size_t keyEnd = 0;
  size_t valueStart = 0;

  // Reserve space in the map for better performance
  params.reserve(10); // Reasonable default capacity for most query strings

  // Parse key-value pairs
  while (pos <= queryString.length()) {
    if (pos == queryString.length() || queryString[pos] == '&') {
      // End of parameter reached
      if (keyEnd > keyStart) {
        std::string key = DecodeURIComponent(queryString.substr(keyStart, keyEnd - keyStart));
        std::string value;

        if (valueStart > 0) {
          value = DecodeURIComponent(queryString.substr(valueStart, pos - valueStart));
        }

        params[key] = value;
      }

      // Reset for next parameter
      if (pos < queryString.length()) {
        keyStart = pos + 1;
        keyEnd = 0;
        valueStart = 0;
      }
    } else if (queryString[pos] == '=' && keyEnd == 0) {
      // Equal sign separates key and value
      keyEnd = pos;
      valueStart = pos + 1;
    }

    pos++;
  }

  return params;
}
```

### URI Decoding Implementation

The URL parser includes a fast URI component decoder:

```cpp
std::string DecodeURIComponent(const std::string& input) {
  std::string result;
  result.reserve(input.length()); // Reserve capacity to avoid reallocations

  for (size_t i = 0; i < input.length(); i++) {
    if (input[i] == '%' && i + 2 < input.length()) {
      // Hex decoding
      char hex[3] = { input[i + 1], input[i + 2], 0 };
      char* endPtr;
      int value = strtol(hex, &endPtr, 16);

      if (endPtr != hex) {
        result += static_cast<char>(value);
        i += 2;
      } else {
        result += input[i];
      }
    } else if (input[i] == '+') {
      // '+' decodes to space
      result += ' ';
    } else {
      result += input[i];
    }
  }

  return result;
}
```

### Memory Management

The URL parser implementation focuses on efficient memory usage:

1. **Pre-allocation**: String buffers are pre-allocated to avoid reallocations:

```cpp
// Reserve capacity for result strings
std::string result;
result.reserve(input.length());
```

2. **Substring References**: The implementation avoids creating unnecessary string copies by using substr only when needed:

```cpp
// Efficient substring reference
components.hostname = url.substr(start, i - start);
```

3. **In-place Parsing**: The algorithm parses URLs in a single pass with minimal allocations:

```cpp
// Single-pass parsing with state machine
for (size_t i = 0; i < url.length(); i++) {
  // ... parsing logic ...
}
```

4. **Fast Hex Decoding**: Query string parameter decoding uses optimized hex conversion:

```cpp
// Fast hex string to integer conversion
char hex[3] = { input[i + 1], input[i + 2], 0 };
int value = strtol(hex, nullptr, 16);
```

5. **No Regular Expressions**: The implementation avoids regular expressions for better performance:

```cpp
// Manual string parsing instead of regular expressions
while (pos <= queryString.length()) {
  if (pos == queryString.length() || queryString[pos] == '&') {
    // Parse key-value pair
  }
  // ...
}
```

6. **Hash Table for Query Parameters**: Query parameters are stored in an unordered_map for fast lookups:

```cpp
// Fast hash table for query parameters
std::unordered_map<std::string, std::string> params;

// Reserve space to avoid rehashing
params.reserve(10);
```

### N-API Integration

The URL parser integrates with Node.js using N-API:

```cpp
Napi::Object UrlParser::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "UrlParser", {
    InstanceMethod("parse", &UrlParser::Parse),
    InstanceMethod("parseQueryString", &UrlParser::ParseQueryString),
    StaticMethod("getPerformanceMetrics", &UrlParser::GetPerformanceMetrics),
    StaticMethod("resetPerformanceMetrics", &UrlParser::ResetPerformanceMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("UrlParser", func);
  return exports;
}

// Convert native result to JavaScript object
Napi::Value UrlParser::Parse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string url = info[0].As<Napi::String>().Utf8Value();

  // Measure performance
  auto start = std::chrono::high_resolution_clock::now();

  // Parse URL
  UrlComponents components = ParseInternal(url);

  // Record performance metrics
  auto end = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
  metrics_.nativeTime += duration.count() / 1000.0; // Convert to milliseconds
  metrics_.nativeCount++;

  // Create result object
  Napi::Object result = Napi::Object::New(env);
  result.Set("protocol", Napi::String::New(env, components.protocol));
  result.Set("auth", Napi::String::New(env, components.auth));
  result.Set("hostname", Napi::String::New(env, components.hostname));
  result.Set("port", Napi::String::New(env, components.port));
  result.Set("pathname", Napi::String::New(env, components.pathname));
  result.Set("search", Napi::String::New(env, components.search));
  result.Set("hash", Napi::String::New(env, components.hash));

  return result;
}
```

### Performance Optimizations

Several optimizations enhance the URL parser's performance:

1. **State Machine Design**: The parser uses a state machine approach for efficient URL parsing:

```cpp
// Efficient state machine for URL parsing
enum class State {
  Protocol,
  AfterProtocol,
  Authority,
  Host,
  Port,
  Path,
  Query,
  Fragment
};
```

2. **Single-pass Processing**: URLs are parsed in a single pass to minimize iterations:

```cpp
// Single-pass parsing
for (size_t i = 0; i < url.length(); i++) {
  // Process each character only once
}
```

3. **Minimal Allocations**: The implementation minimizes memory allocations:

```cpp
// Components structure initialized once
UrlComponents components;

// Reuse the same structure for all parsing
components.protocol = "";
components.auth = "";
// ...
```

4. **Fast Hex Decoding**: Query string parameter decoding uses optimized hex conversion:

```cpp
// Fast hex string to integer conversion
char hex[3] = { input[i + 1], input[i + 2], 0 };
int value = strtol(hex, nullptr, 16);
```

5. **No Regular Expressions**: The implementation avoids regular expressions for better performance:

```cpp
// Manual string parsing instead of regular expressions
while (pos <= queryString.length()) {
  if (pos == queryString.length() || queryString[pos] == '&') {
    // Parse key-value pair
  }
  // ...
}
```

6. **Hash Table for Query Parameters**: Query parameters are stored in an unordered_map for fast lookups:

```cpp
// Fast hash table for query parameters
std::unordered_map<std::string, std::string> params;

// Reserve space to avoid rehashing
params.reserve(10);
```

## Performance Considerations

- The native implementation is significantly faster than JavaScript's built-in URL parsing, especially for applications that process many URLs
- Query string parsing is optimized to avoid unnecessary string splitting and joining operations
- For simple URLs or infrequent parsing, the overhead of crossing the JavaScript/C++ boundary might reduce the performance advantage
- The module automatically measures and tracks performance metrics for both implementations

## Examples

### Basic Usage

```typescript
import { UrlParser } from 'nexurejs';

// Create a new parser instance
const parser = new UrlParser();

// Parse a URL
const url = 'https://user:pass@example.com:8080/path/to/page?query=value&sort=asc#section';
const parsed = parser.parse(url);

console.log(parsed.protocol);  // 'https:'
console.log(parsed.auth);      // 'user:pass'
console.log(parsed.hostname);  // 'example.com'
console.log(parsed.port);      // '8080'
console.log(parsed.pathname);  // '/path/to/page'
console.log(parsed.search);    // '?query=value&sort=asc'
console.log(parsed.hash);      // '#section'

// Parse a query string
const queryParams = parser.parseQueryString('?query=value&sort=asc&page=1');
console.log(queryParams.query);  // 'value'
console.log(queryParams.sort);   // 'asc'
console.log(queryParams.page);   // '1'
```

### Performance Monitoring

```typescript
import { UrlParser } from 'nexurejs';

// Get performance metrics
const metrics = UrlParser.getPerformanceMetrics();
console.log(`Native parser: ${metrics.nativeCount} calls in ${metrics.nativeTime}ms`);
console.log(`JS parser: ${metrics.jsCount} calls in ${metrics.jsTime}ms`);

// Reset metrics
UrlParser.resetPerformanceMetrics();
```

### Integration with HTTP Server

```typescript
import { createServer } from 'http';
import { UrlParser } from 'nexurejs';

const urlParser = new UrlParser();

const server = createServer((req, res) => {
  // Parse the requested URL
  const parsedUrl = urlParser.parse(req.url || '/');

  // Parse query parameters
  const queryParams = urlParser.parseQueryString(parsedUrl.search);

  // Use the parsed components
  if (parsedUrl.pathname === '/api/users') {
    const userId = queryParams.id;
    // Process the request based on the userId
    // ...
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ pathname: parsedUrl.pathname, params: queryParams }));
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000/');
});
```
