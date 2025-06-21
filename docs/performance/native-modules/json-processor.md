# JSON Processor Native Module

## Overview

The JSON Processor is a high-performance C++ implementation for parsing and stringifying JSON data. It uses the SimdJSON library for extremely fast JSON processing, providing significant performance improvements over JavaScript's native `JSON.parse` and `JSON.stringify` methods.

## Features

- Extremely fast JSON parsing and stringification using SimdJSON
- Stream-based parsing for handling large JSON arrays
- Stream-based stringification for generating large JSON arrays
- Error handling with precise error messages
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor()
```

Creates a new instance of the JSON Processor. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

### Methods

#### `parse(json: string | Buffer): any`

Parses a JSON string or Buffer into a JavaScript object or value.

**Parameters:**
- `json: string | Buffer` - JSON string or Buffer to parse

**Returns:**
- `any` - Parsed JavaScript object or value

**Throws:**
- Error if the input is not valid JSON

#### `stringify(value: any): string`

Converts a JavaScript object or value to a JSON string.

**Parameters:**
- `value: any` - JavaScript object or value to convert to JSON

**Returns:**
- `string` - JSON string representation

**Throws:**
- Error if the value cannot be converted to JSON

#### `parseStream(buffer: Buffer): any[]`

Parses a Buffer containing a JSON array into an array of JavaScript objects or values. Optimized for streaming large JSON arrays.

**Parameters:**
- `buffer: Buffer` - Buffer containing a JSON array

**Returns:**
- `any[]` - Array of parsed JavaScript objects or values

**Throws:**
- Error if the input is not a valid JSON array

#### `stringifyStream(values: any[]): string`

Converts an array of JavaScript objects or values to a JSON array string. Optimized for generating large JSON arrays.

**Parameters:**
- `values: any[]` - Array of JavaScript objects or values

**Returns:**
- `string` - JSON array string representation

**Throws:**
- Error if any value in the array cannot be converted to JSON

### Static Methods

#### `getPerformanceMetrics(): { jsParseTime: number; jsParseCount: number; jsStringifyTime: number; jsStringifyCount: number; nativeParseTime: number; nativeParseCount: number; nativeStringifyTime: number; nativeStringifyCount: number }`

Returns performance metrics for both JavaScript and native implementations.

**Returns:**
- `jsParseTime` - Total time spent in JavaScript parse (ms)
- `jsParseCount` - Number of times JavaScript parse was used
- `jsStringifyTime` - Total time spent in JavaScript stringify (ms)
- `jsStringifyCount` - Number of times JavaScript stringify was used
- `nativeParseTime` - Total time spent in native parse (ms)
- `nativeParseCount` - Number of times native parse was used
- `nativeStringifyTime` - Total time spent in native stringify (ms)
- `nativeStringifyCount` - Number of times native stringify was used

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The JSON Processor native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. It uses the SimdJSON library, which leverages SIMD (Single Instruction, Multiple Data) instructions for extremely fast JSON parsing.

### SimdJSON

SimdJSON is one of the fastest JSON parsers available, using advanced techniques like:
- SIMD instructions for parallel processing
- Branchless programming for better CPU pipeline usage
- Single-pass parsing with minimal memory allocation
- Zero-copy string handling where possible

## C++ Implementation Explained

### Core Classes and Methods

#### `JsonProcessor` Class

This is the main C++ class that handles JSON processing using SimdJSON:

```cpp
class JsonProcessor : public Napi::ObjectWrap<JsonProcessor> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  JsonProcessor(const Napi::CallbackInfo& info);
  ~JsonProcessor();

private:
  // JavaScript-facing methods
  Napi::Value Parse(const Napi::CallbackInfo& info);
  Napi::Value Stringify(const Napi::CallbackInfo& info);
  Napi::Value ParseStream(const Napi::CallbackInfo& info);
  Napi::Value StringifyStream(const Napi::CallbackInfo& info);

  // Performance metrics
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // Internal implementation methods
  Napi::Value ParseInternal(const Napi::Env& env, const char* data, size_t length);
  std::string StringifyInternal(const Napi::Env& env, const Napi::Value& value);
  Napi::Array ParseStreamInternal(const Napi::Env& env, const char* data, size_t length);
  std::string StringifyStreamInternal(const Napi::Env& env, const Napi::Array& array);

  // SimdJSON parser instance
  simdjson::dom::parser parser_;

  // Performance metrics
  static PerformanceMetrics metrics_;
};
```

#### SimdJSON Integration

The module uses SimdJSON for high-performance JSON parsing:

```cpp
// Initialize SimdJSON parser with a reasonable buffer size
simdjson::dom::parser parser_; // Initialized in constructor

// Parse JSON using SimdJSON
Napi::Value JsonProcessor::ParseInternal(const Napi::Env& env, const char* data, size_t length) {
  try {
    // Parse JSON using SimdJSON
    simdjson::dom::element element;
    auto error = parser_.parse(data, length).get(element);

    if (error) {
      // Handle parsing error
      throw Napi::Error::New(env, simdjson::error_message(error));
    }

    // Convert SimdJSON element to JavaScript value
    return SimdJsonToNapi(env, element);
  } catch (const simdjson::simdjson_error& e) {
    // Convert SimdJSON exception to JavaScript exception
    throw Napi::Error::New(env, e.what());
  }
}
```

### Conversion Between SimdJSON and N-API

The most complex part of the implementation is the bidirectional conversion between SimdJSON elements and Node.js values:

```cpp
// Convert SimdJSON element to Napi::Value (JavaScript value)
Napi::Value SimdJsonToNapi(const Napi::Env& env, const simdjson::dom::element& element) {
  switch (element.type()) {
    case simdjson::dom::element_type::ARRAY: {
      // Handle JSON array
      simdjson::dom::array array;
      element.get(array);

      Napi::Array result = Napi::Array::New(env);
      size_t index = 0;

      // Convert each array element
      for (simdjson::dom::element item : array) {
        result.Set(index++, SimdJsonToNapi(env, item));
      }

      return result;
    }

    case simdjson::dom::element_type::OBJECT: {
      // Handle JSON object
      simdjson::dom::object object;
      element.get(object);

      Napi::Object result = Napi::Object::New(env);

      // Convert each object property
      for (auto field : object) {
        result.Set(field.key, SimdJsonToNapi(env, field.value));
      }

      return result;
    }

    case simdjson::dom::element_type::INT64: {
      // Handle integer
      int64_t value;
      element.get(value);

      // Check if it fits in a 32-bit integer (for better JavaScript compatibility)
      if (value >= INT32_MIN && value <= INT32_MAX) {
        return Napi::Number::New(env, static_cast<int32_t>(value));
      } else {
        // Use a BigInt for larger numbers
        return Napi::BigInt::New(env, value);
      }
    }

    case simdjson::dom::element_type::UINT64: {
      // Handle unsigned integer
      uint64_t value;
      element.get(value);

      if (value <= INT32_MAX) {
        return Napi::Number::New(env, static_cast<uint32_t>(value));
      } else {
        return Napi::BigInt::New(env, value);
      }
    }

    case simdjson::dom::element_type::DOUBLE: {
      // Handle floating-point number
      double value;
      element.get(value);
      return Napi::Number::New(env, value);
    }

    case simdjson::dom::element_type::STRING: {
      // Handle string
      std::string_view view;
      element.get(view);
      return Napi::String::New(env, view.data(), view.length());
    }

    case simdjson::dom::element_type::BOOL: {
      // Handle boolean
      bool value;
      element.get(value);
      return Napi::Boolean::New(env, value);
    }

    case simdjson::dom::element_type::NULL_VALUE: {
      // Handle null
      return env.Null();
    }

    default:
      // Unknown type
      throw Napi::Error::New(env, "Unknown JSON element type");
  }
}

// Convert Napi::Value (JavaScript value) to string for JSON stringification
std::string NapiValueToJsonString(const Napi::Env& env, const Napi::Value& value, int depth = 0) {
  // Prevent excessive recursion
  if (depth > 1000) {
    throw Napi::Error::New(env, "Maximum recursion depth exceeded");
  }

  if (value.IsNull() || value.IsUndefined()) {
    return "null";
  } else if (value.IsBoolean()) {
    return value.As<Napi::Boolean>().Value() ? "true" : "false";
  } else if (value.IsNumber()) {
    // Convert number to string with proper precision
    double numValue = value.As<Napi::Number>().DoubleValue();
    if (std::isfinite(numValue)) {
      char buffer[100];
      int len = snprintf(buffer, sizeof(buffer), "%.16g", numValue);
      return std::string(buffer, len);
    } else {
      return "null"; // Handle NaN and Infinity as null
    }
  } else if (value.IsBigInt()) {
    // Handle BigInt
    bool lossless;
    int64_t bigintValue = value.As<Napi::BigInt>().Int64Value(&lossless);

    if (lossless) {
      return std::to_string(bigintValue);
    } else {
      throw Napi::Error::New(env, "BigInt too large to represent as JSON");
    }
  } else if (value.IsString()) {
    // Properly escape string for JSON
    return EscapeJsonString(value.As<Napi::String>().Utf8Value());
  } else if (value.IsArray()) {
    // Handle arrays
    Napi::Array array = value.As<Napi::Array>();
    std::string result = "[";

    for (uint32_t i = 0; i < array.Length(); i++) {
      if (i > 0) result += ",";
      result += NapiValueToJsonString(env, array[i], depth + 1);
    }

    result += "]";
    return result;
  } else if (value.IsObject() && !value.IsFunction() && !value.IsDate()) {
    // Handle regular objects
    Napi::Object object = value.As<Napi::Object>();
    Napi::Array properties = object.GetPropertyNames();
    std::string result = "{";

    bool first = true;
    for (uint32_t i = 0; i < properties.Length(); i++) {
      Napi::Value key = properties[i];

      if (key.IsString()) {
        Napi::Value propValue = object.Get(key);

        // Skip functions and undefined values
        if (propValue.IsFunction() || propValue.IsUndefined()) {
          continue;
        }

        if (!first) result += ",";
        first = false;

        // Add property key and value
        result += EscapeJsonString(key.As<Napi::String>().Utf8Value()) + ":" +
                  NapiValueToJsonString(env, propValue, depth + 1);
      }
    }

    result += "}";
    return result;
  } else if (value.IsDate()) {
    // Handle Date objects by converting to ISO string
    Napi::Object dateObj = value.As<Napi::Object>();
    Napi::Function toISOString = dateObj.Get("toISOString").As<Napi::Function>();
    Napi::Value isoString = toISOString.Call(dateObj, {});

    return EscapeJsonString(isoString.As<Napi::String>().Utf8Value());
  } else if (value.IsFunction()) {
    // Functions are not supported in JSON
    return "null";
  } else {
    // Fallback for other types
    return "null";
  }
}

// Helper function to escape strings for JSON
std::string EscapeJsonString(const std::string& str) {
  std::string result = "\"";

  for (auto c : str) {
    switch (c) {
      case '"': result += "\\\""; break;
      case '\\': result += "\\\\"; break;
      case '\b': result += "\\b"; break;
      case '\f': result += "\\f"; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 32) {
          // Handle control characters
          char buffer[8];
          snprintf(buffer, sizeof(buffer), "\\u%04x", c);
          result += buffer;
        } else {
          result += c;
        }
        break;
    }
  }

  result += "\"";
  return result;
}
```

### Stream-based Processing

The stream-based processing methods are optimized for handling large JSON arrays:

```cpp
// Parse a large JSON array efficiently
Napi::Array JsonProcessor::ParseStreamInternal(const Napi::Env& env, const char* data, size_t length) {
  // Validate that the data begins with '[' and ends with ']'
  if (length < 2 || data[0] != '[' || data[length - 1] != ']') {
    throw Napi::Error::New(env, "Input is not a JSON array");
  }

  // Use SimdJSON's streaming capabilities for efficient parsing
  simdjson::ondemand::parser parser;

  // Create padded buffer for SimdJSON
  std::unique_ptr<char[]> padded_buffer(new char[length + simdjson::SIMDJSON_PADDING]);
  std::memcpy(padded_buffer.get(), data, length);
  std::memset(padded_buffer.get() + length, 0, simdjson::SIMDJSON_PADDING);

  // Parse the JSON array using SimdJSON's ondemand parser
  try {
    simdjson::ondemand::document doc = parser.iterate(padded_buffer.get(), length, length);
    simdjson::ondemand::array array = doc.get_array();

    // Create JavaScript array
    Napi::Array result = Napi::Array::New(env);
    uint32_t index = 0;

    // Extract array elements one by one
    for (auto element : array) {
      // Convert each element to a JavaScript value
      simdjson::ondemand::value_type type = element.type();

      switch (type) {
        case simdjson::ondemand::json_type::array:
          result.Set(index++, OndemandArrayToNapi(env, element.get_array()));
          break;
        case simdjson::ondemand::json_type::object:
          result.Set(index++, OndemandObjectToNapi(env, element.get_object()));
          break;
        case simdjson::ondemand::json_type::number:
          // Try to determine if it's an integer or double
          if (element.is_integer()) {
            int64_t value = element.get_int64();
            if (value >= INT32_MIN && value <= INT32_MAX) {
              result.Set(index++, Napi::Number::New(env, static_cast<int32_t>(value)));
            } else {
              result.Set(index++, Napi::BigInt::New(env, value));
            }
          } else {
            double value = element.get_double();
            result.Set(index++, Napi::Number::New(env, value));
          }
          break;
        case simdjson::ondemand::json_type::string: {
          std::string_view sv = element.get_string();
          result.Set(index++, Napi::String::New(env, sv.data(), sv.length()));
          break;
        }
        case simdjson::ondemand::json_type::boolean:
          result.Set(index++, Napi::Boolean::New(env, element.get_bool()));
          break;
        case simdjson::ondemand::json_type::null:
          result.Set(index++, env.Null());
          break;
        default:
          throw Napi::Error::New(env, "Unknown JSON element type in array");
      }
    }

    return result;
  } catch (const simdjson::simdjson_error& e) {
    throw Napi::Error::New(env, std::string("JSON parse error: ") + e.what());
  }
}

// Efficiently stringify a large array
std::string JsonProcessor::StringifyStreamInternal(const Napi::Env& env, const Napi::Array& array) {
  // Estimate the final size to minimize reallocations
  size_t estimatedSize = array.Length() * 100; // Rough estimate of 100 bytes per item
  std::string result;
  result.reserve(estimatedSize);

  result += "[";

  for (uint32_t i = 0; i < array.Length(); i++) {
    if (i > 0) {
      result += ",";
    }

    Napi::Value item = array[i];
    result += NapiValueToJsonString(env, item);

    // Check if we need to expand our reserved space
    if (result.capacity() - result.length() < 100) {
      result.reserve(result.capacity() * 2);
    }
  }

  result += "]";
  return result;
}
```

### Memory Management

The JSON processor is designed to efficiently manage memory:

1. **Buffer Management**: The module uses SimdJSON's buffer management for optimal memory usage:

```cpp
// Ensure sufficient padding for SimdJSON
std::unique_ptr<char[]> padded_buffer(new char[length + simdjson::SIMDJSON_PADDING]);
std::memcpy(padded_buffer.get(), data, length);
std::memset(padded_buffer.get() + length, 0, simdjson::SIMDJSON_PADDING);
```

2. **String Handling**: The implementation avoids unnecessary string copies by using string views:

```cpp
// Efficient string handling with string_view
std::string_view sv = element.get_string();
return Napi::String::New(env, sv.data(), sv.length());
```

3. **String Builder for Stringification**: The module uses efficient string building for JSON stringification:

```cpp
// Pre-allocate string buffer for better performance
std::string result;
result.reserve(estimatedSize);

// Efficiently append to the string
result += "{";
// ... build string ...
result += "}";
```

### N-API Integration

The JSON processor integrates with Node.js using N-API:

```cpp
Napi::Object JsonProcessor::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "JsonProcessor", {
    InstanceMethod("parse", &JsonProcessor::Parse),
    InstanceMethod("stringify", &JsonProcessor::Stringify),
    InstanceMethod("parseStream", &JsonProcessor::ParseStream),
    InstanceMethod("stringifyStream", &JsonProcessor::StringifyStream),
    StaticMethod("getPerformanceMetrics", &JsonProcessor::GetPerformanceMetrics),
    StaticMethod("resetPerformanceMetrics", &JsonProcessor::ResetPerformanceMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("JsonProcessor", func);
  return exports;
}
```

### Error Handling

The module provides robust error handling with informative error messages:

```cpp
// Handle SimdJSON parsing errors
try {
  simdjson::dom::element element;
  auto error = parser_.parse(data, length).get(element);

  if (error) {
    // Convert SimdJSON error to JavaScript exception with descriptive message
    throw Napi::Error::New(env, simdjson::error_message(error));
  }

  // Continue processing...
} catch (const simdjson::simdjson_error& e) {
  // Add context to the error
  throw Napi::Error::New(env, std::string("JSON parsing error: ") + e.what());
}
```

### Performance Optimizations

Several optimizations enhance the JSON processor's performance:

1. **SIMD Instructions**: SimdJSON leverages SIMD instructions for parallel processing:

```cpp
// SimdJSON automatically uses the best available SIMD instructions (AVX2, SSE4.2, etc.)
simdjson::dom::parser parser_;
```

2. **Buffer Reuse**: The parser reuses internal buffers to avoid allocations:

```cpp
// The SimdJSON parser object is reused across calls
simdjson::dom::parser parser_; // Created once in constructor

// This reuses internal buffers for multiple parse operations
JsonProcessor::Parse(const Napi::CallbackInfo& info) {
  // ... get input ...

  // Reuses the parser's internal buffers
  auto result = parser_.parse(data, length);

  // ... process result ...
}
```

3. **Zero-copy String Handling**: String data is handled with minimal copying:

```cpp
// SimdJSON uses string_view for zero-copy string access
std::string_view sv = element.get_string();
return Napi::String::New(env, sv.data(), sv.length());
```

4. **Streaming Parser for Large Arrays**: The module uses SimdJSON's on-demand parsing API for large arrays:

```cpp
// On-demand parsing for streaming large arrays
simdjson::ondemand::parser parser;
simdjson::ondemand::document doc = parser.iterate(padded_buffer.get(), length, length);
```

5. **Branchless Processing**: SimdJSON uses branchless programming techniques:

```cpp
// SimdJSON internally uses branchless techniques like:
// - SIMD comparisons that generate masks
// - Bit manipulation instead of branches
// - Stage-based parsing without conditionals
```

## Performance Considerations

- The native implementation is significantly faster than JavaScript's native `JSON.parse` and `JSON.stringify`, especially for large JSON documents
- SimdJSON provides particularly good performance for parsing large JSON data
- For very small JSON strings, the overhead of crossing the JavaScript/C++ boundary might reduce the performance advantage
- The stream-based methods (`parseStream` and `stringifyStream`) provide better performance for large arrays by reducing memory allocation

## Examples

### Basic Usage

```typescript
import { JsonProcessor } from 'nexurejs';

// Create a new processor instance
const processor = new JsonProcessor();

// Parse a JSON string
const jsonString = '{"name":"John","age":30,"isActive":true,"skills":["JavaScript","Node.js"]}';
const parsed = processor.parse(jsonString);

console.log(parsed.name);        // 'John'
console.log(parsed.skills[1]);   // 'Node.js'

// Stringify a JavaScript object
const object = {
  id: 123,
  timestamp: new Date(),
  data: {
    values: [1, 2, 3, 4, 5]
  }
};
const stringified = processor.stringify(object);
console.log(stringified);
```

### Stream Processing

```typescript
import { JsonProcessor } from 'nexurejs';
import { readFileSync } from 'fs';

const processor = new JsonProcessor();

// Parse a large JSON array from a file
const largeArrayBuffer = readFileSync('large-array.json');
const items = processor.parseStream(largeArrayBuffer);

console.log(`Processed ${items.length} items`);

// Create a large JSON array
const results = [];
for (let i = 0; i < 10000; i++) {
  results.push({ id: i, value: `Item ${i}` });
}

const json = processor.stringifyStream(results);
console.log(`Generated JSON array of length ${json.length}`);
```

### Performance Monitoring

```typescript
import { JsonProcessor } from 'nexurejs';

// Get performance metrics
const metrics = JsonProcessor.getPerformanceMetrics();
console.log(`Native parse: ${metrics.nativeParseCount} calls in ${metrics.nativeParseTime}ms`);
console.log(`JS parse: ${metrics.jsParseCount} calls in ${metrics.jsParseTime}ms`);
console.log(`Native stringify: ${metrics.nativeStringifyCount} calls in ${metrics.nativeStringifyTime}ms`);
console.log(`JS stringify: ${metrics.jsStringifyCount} calls in ${metrics.jsStringifyTime}ms`);

// Reset metrics
JsonProcessor.resetPerformanceMetrics();
```
