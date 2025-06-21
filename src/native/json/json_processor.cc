#include "json_processor.h"
#include <sstream>
#include <iomanip>
#include <cmath>
#include <cstring>
#include <string>
#include <memory>
#include <vector>
#include <cinttypes>
#include <limits>
#include <simdjson.h>

// SIMD intrinsics for optimization
#ifdef __x86_64__
#include <immintrin.h>
#include <nmmintrin.h>
#endif

// SIMD-optimized JSON validation and preprocessing utilities
namespace JsonSIMD {

// Check if AVX2 is available
static bool HasAVX2() {
#ifdef __x86_64__
  static int avx2_supported = -1;
  if (avx2_supported == -1) {
    int cpuInfo[4];
    __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    avx2_supported = (cpuInfo[1] & (1 << 5)) ? 1 : 0;
  }
  return avx2_supported == 1;
#else
  return false;
#endif
}

// SIMD-optimized JSON character validation
bool ValidateJsonChars_SIMD(const char* json, size_t length) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 32) {
    // Fallback to scalar validation
    for (size_t i = 0; i < length; ++i) {
      char c = json[i];
      if (c < 0x20 && c != '\t' && c != '\n' && c != '\r') {
        return false; // Invalid control character
      }
    }
    return true;
  }

  const size_t simd_width = 32;
  const size_t simd_iterations = length / simd_width;

  // Control character mask (valid: tab, newline, carriage return, and >= 0x20)
  __m256i tab_mask = _mm256_set1_epi8('\t');
  __m256i newline_mask = _mm256_set1_epi8('\n');
  __m256i cr_mask = _mm256_set1_epi8('\r');
  __m256i min_valid = _mm256_set1_epi8(0x20);

  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256i chars = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(json + i * simd_width));

    // Check for valid characters: >= 0x20 OR tab OR newline OR carriage return
    __m256i ge_min = _mm256_cmpgt_epi8(chars, _mm256_sub_epi8(min_valid, _mm256_set1_epi8(1)));
    __m256i is_tab = _mm256_cmpeq_epi8(chars, tab_mask);
    __m256i is_newline = _mm256_cmpeq_epi8(chars, newline_mask);
    __m256i is_cr = _mm256_cmpeq_epi8(chars, cr_mask);

    __m256i valid = _mm256_or_si256(_mm256_or_si256(ge_min, is_tab),
                                   _mm256_or_si256(is_newline, is_cr));

    int mask = _mm256_movemask_epi8(valid);
    if (mask != -1) { // Not all characters are valid
      return false;
    }
  }

  // Check remaining characters
  for (size_t i = simd_iterations * simd_width; i < length; ++i) {
    char c = json[i];
    if (c < 0x20 && c != '\t' && c != '\n' && c != '\r') {
      return false;
    }
  }

  return true;
#else
  // Scalar fallback
  for (size_t i = 0; i < length; ++i) {
    char c = json[i];
    if (c < 0x20 && c != '\t' && c != '\n' && c != '\r') {
      return false;
    }
  }
  return true;
#endif
}

// SIMD-optimized whitespace trimming
size_t TrimWhitespace_SIMD(const char* json, size_t length, size_t& start) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 32) {
    // Scalar fallback
    start = 0;
    while (start < length && (json[start] == ' ' || json[start] == '\t' ||
                              json[start] == '\n' || json[start] == '\r')) {
      ++start;
    }

    size_t end = length;
    while (end > start && (json[end-1] == ' ' || json[end-1] == '\t' ||
                           json[end-1] == '\n' || json[end-1] == '\r')) {
      --end;
    }

    return end - start;
  }

  // Find start using SIMD
  start = 0;
  __m256i space_mask = _mm256_set1_epi8(' ');
  __m256i tab_mask = _mm256_set1_epi8('\t');
  __m256i newline_mask = _mm256_set1_epi8('\n');
  __m256i cr_mask = _mm256_set1_epi8('\r');

  // Process 32 bytes at a time from the beginning
  for (size_t i = 0; i + 32 <= length; i += 32) {
    __m256i chars = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(json + i));

    __m256i is_space = _mm256_cmpeq_epi8(chars, space_mask);
    __m256i is_tab = _mm256_cmpeq_epi8(chars, tab_mask);
    __m256i is_newline = _mm256_cmpeq_epi8(chars, newline_mask);
    __m256i is_cr = _mm256_cmpeq_epi8(chars, cr_mask);

    __m256i is_whitespace = _mm256_or_si256(_mm256_or_si256(is_space, is_tab),
                                           _mm256_or_si256(is_newline, is_cr));

    int mask = _mm256_movemask_epi8(is_whitespace);
    if (mask != -1) { // Found non-whitespace
      // Find first non-whitespace byte
      for (int j = 0; j < 32; ++j) {
        if (!(mask & (1 << j))) {
          start = i + j;
          break;
        }
      }
      break;
    }

    if (i + 32 >= length) {
      start = length; // All whitespace
    }
  }

  // Handle remaining bytes at start
  if (start == 0) {
    while (start < length && (json[start] == ' ' || json[start] == '\t' ||
                              json[start] == '\n' || json[start] == '\r')) {
      ++start;
    }
  }

  // Find end using SIMD (working backwards is complex, use scalar)
  size_t end = length;
  while (end > start && (json[end-1] == ' ' || json[end-1] == '\t' ||
                         json[end-1] == '\n' || json[end-1] == '\r')) {
    --end;
  }

  return end - start;
#else
  // Scalar fallback
  start = 0;
  while (start < length && (json[start] == ' ' || json[start] == '\t' ||
                            json[start] == '\n' || json[start] == '\r')) {
    ++start;
  }

  size_t end = length;
  while (end > start && (json[end-1] == ' ' || json[end-1] == '\t' ||
                         json[end-1] == '\n' || json[end-1] == '\r')) {
    --end;
  }

  return end - start;
#endif
}

// SIMD-optimized string escaping detection
bool HasEscapeChars_SIMD(const char* str, size_t length) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 32) {
    // Scalar fallback
    for (size_t i = 0; i < length; ++i) {
      if (str[i] == '\\' || str[i] == '"' || str[i] < 0x20) {
        return true;
      }
    }
    return false;
  }

  const size_t simd_width = 32;
  const size_t simd_iterations = length / simd_width;

  __m256i backslash_mask = _mm256_set1_epi8('\\');
  __m256i quote_mask = _mm256_set1_epi8('"');
  __m256i control_threshold = _mm256_set1_epi8(0x20);

  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256i chars = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(str + i * simd_width));

    __m256i is_backslash = _mm256_cmpeq_epi8(chars, backslash_mask);
    __m256i is_quote = _mm256_cmpeq_epi8(chars, quote_mask);
    __m256i is_control = _mm256_cmpgt_epi8(control_threshold, chars);

    __m256i needs_escape = _mm256_or_si256(_mm256_or_si256(is_backslash, is_quote), is_control);

    int mask = _mm256_movemask_epi8(needs_escape);
    if (mask != 0) {
      return true;
    }
  }

  // Check remaining characters
  for (size_t i = simd_iterations * simd_width; i < length; ++i) {
    if (str[i] == '\\' || str[i] == '"' || str[i] < 0x20) {
      return true;
    }
  }

  return false;
#else
  // Scalar fallback
  for (size_t i = 0; i < length; ++i) {
    if (str[i] == '\\' || str[i] == '"' || str[i] < 0x20) {
      return true;
    }
  }
  return false;
#endif
}

// Fast integer parsing with SIMD validation
bool ParseIntegerSIMD(const char* str, size_t length, int64_t& result) {
  if (length == 0 || length > 19) return false; // int64 max digits

  // Quick validation that all chars are digits (except first might be minus)
  size_t start = 0;
  bool negative = false;

  if (str[0] == '-') {
    negative = true;
    start = 1;
    if (length == 1) return false;
  }

#ifdef __x86_64__
  if (HasAVX2() && length - start >= 16) {
    // Validate digits using SIMD
    __m256i char_data = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(str + start));
    __m256i zero_mask = _mm256_set1_epi8('0');
    __m256i nine_mask = _mm256_set1_epi8('9');

    __m256i ge_zero = _mm256_cmpgt_epi8(char_data, _mm256_sub_epi8(zero_mask, _mm256_set1_epi8(1)));
    __m256i le_nine = _mm256_cmpgt_epi8(_mm256_add_epi8(nine_mask, _mm256_set1_epi8(1)), char_data);
    __m256i is_digit = _mm256_and_si256(ge_zero, le_nine);

    int mask = _mm256_movemask_epi8(is_digit);
    // Check only the relevant bytes
    int relevant_mask = (1 << (length - start)) - 1;
    if ((mask & relevant_mask) != relevant_mask) {
      return false; // Not all characters are digits
    }
  }
#endif

  // Parse the integer
  result = 0;
  for (size_t i = start; i < length; ++i) {
    char c = str[i];
    if (c < '0' || c > '9') return false;

    int64_t digit = c - '0';
    if (result > (INT64_MAX - digit) / 10) {
      return false; // Overflow
    }
    result = result * 10 + digit;
  }

  if (negative) {
    result = -result;
  }

  return true;
}

} // namespace JsonSIMD

// Initialize the JSON processor class
Napi::Object JsonProcessor::Init(Napi::Env env, Napi::Object exports) {
  // Define the JsonProcessor class
  Napi::Function func = DefineClass(env, "JsonProcessor", {
    InstanceMethod("parse", &JsonProcessor::Parse),
    InstanceMethod("parseBuffer", &JsonProcessor::ParseBuffer),
    InstanceMethod("parseStream", &JsonProcessor::ParseStream),
    InstanceMethod("stringify", &JsonProcessor::Stringify),
    InstanceMethod("stringifyStream", &JsonProcessor::StringifyStream),
    InstanceMethod("setParserMode", &JsonProcessor::SetParserMode),
    InstanceMethod("getParserMode", &JsonProcessor::GetParserMode),
    InstanceMethod("setBufferSize", &JsonProcessor::SetBufferSize),
    InstanceMethod("getBufferSize", &JsonProcessor::GetBufferSize),
    InstanceMethod("releaseBuffers", &JsonProcessor::ReleaseBuffers),
  });

  // Create a constructor
  Napi::FunctionReference* constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);
  env.SetInstanceData(constructor);

  // Set export
  exports.Set("JsonProcessor", func);
  return exports;
}

// Constructor
JsonProcessor::JsonProcessor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<JsonProcessor>(info) {
  // Pre-allocate string buffer
  stringBuffer_.reserve(initialStringBufferSize_);

  // Pre-allocate padded buffer for simdjson
  paddedBuffer_.reserve(initialPaddedBufferSize_);

  // Parse options if provided
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    // Set parser mode if provided
    if (options.Has("parserMode") && options.Get("parserMode").IsNumber()) {
      int modeValue = options.Get("parserMode").As<Napi::Number>().Int32Value();
      if (modeValue >= 0 && modeValue <= 2) {
        parserMode_ = static_cast<ParserMode>(modeValue);
      }
    }

    // Set buffer size if provided
    if (options.Has("bufferSize") && options.Get("bufferSize").IsNumber()) {
      size_t sizeValue = options.Get("bufferSize").As<Napi::Number>().Uint32Value();
      if (sizeValue > 1024) {
        initialStringBufferSize_ = sizeValue;
        initialPaddedBufferSize_ = sizeValue;
        // Reallocate buffers
        stringBuffer_.reserve(initialStringBufferSize_);
        paddedBuffer_.reserve(initialPaddedBufferSize_);
      }
    }
  }
}

// Destructor
JsonProcessor::~JsonProcessor() {
  // Free temporary buffer if it exists
  if (tempBuffer_ != nullptr) {
    delete[] tempBuffer_;
    tempBuffer_ = nullptr;
    tempBufferSize_ = 0;
  }
}

// Create a new instance wrapper
Napi::Object JsonProcessor::NewInstance(Napi::Env env, Napi::Value arg) {
  Napi::EscapableHandleScope scope(env);

  Napi::Object obj = env.GetInstanceData<Napi::FunctionReference>()->New({arg});
  return scope.Escape(napi_value(obj)).ToObject();
}

// Configuration methods
Napi::Value JsonProcessor::SetParserMode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected for parser mode").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int mode = info[0].As<Napi::Number>().Int32Value();
  if (mode < 0 || mode > 2) {
    Napi::RangeError::New(env, "Parser mode must be 0 (auto), 1 (DOM), or 2 (OnDemand)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  parserMode_ = static_cast<ParserMode>(mode);
  return Napi::Number::New(env, static_cast<int>(parserMode_));
}

Napi::Value JsonProcessor::GetParserMode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, static_cast<int>(parserMode_));
}

// Set buffer size for various internal buffers
Napi::Value JsonProcessor::SetBufferSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get new buffer size
  size_t newSize = info[0].As<Napi::Number>().Uint32Value();

  // Validate size (minimum 1KB, maximum 1GB)
  if (newSize < 1024) {
    newSize = 1024;
  } else if (newSize > 1024 * 1024 * 1024) {
    newSize = 1024 * 1024 * 1024;
  }

  // Update internal buffer sizes
  initialStringBufferSize_ = newSize;
  initialPaddedBufferSize_ = newSize;

  // Reserve string buffers
  stringBuffer_.reserve(newSize);
  paddedBuffer_.reserve(newSize);

  return Napi::Number::New(env, newSize);
}

// Get current buffer size
Napi::Value JsonProcessor::GetBufferSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, initialStringBufferSize_);
}

// Release temporary buffers to free memory
Napi::Value JsonProcessor::ReleaseBuffers(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Clear string buffers and reallocate with initial size
  stringBuffer_.clear();
  stringBuffer_.shrink_to_fit();
  stringBuffer_.reserve(initialStringBufferSize_);

  paddedBuffer_.clear();
  paddedBuffer_.shrink_to_fit();
  paddedBuffer_.reserve(initialPaddedBufferSize_);

  // Free temp buffer if it exists
  if (tempBuffer_ != nullptr) {
    delete[] tempBuffer_;
    tempBuffer_ = nullptr;
    tempBufferSize_ = 0;
  }

  return env.Undefined();
}

// Main Parse method - handles string input
Napi::Value JsonProcessor::Parse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get input string
  std::string json = info[0].As<Napi::String>().Utf8Value();

  // Fast path for empty strings
  if (json.empty()) {
    return env.Null();
  }

  // SIMD-optimized preprocessing
  size_t trimStart = 0;
  size_t actualLength = JsonSIMD::TrimWhitespace_SIMD(json.c_str(), json.length(), trimStart);

  if (actualLength == 0) {
    return env.Null();
  }

  // Fast path for small documents
  if (actualLength < 10) {
    const char* trimmedJson = json.c_str() + trimStart;
    if (actualLength == 4 && std::memcmp(trimmedJson, "null", 4) == 0) return env.Null();
    if (actualLength == 4 && std::memcmp(trimmedJson, "true", 4) == 0) return Napi::Boolean::New(env, true);
    if (actualLength == 5 && std::memcmp(trimmedJson, "false", 5) == 0) return Napi::Boolean::New(env, false);

    // Try fast integer parsing
    int64_t intValue;
    if (JsonSIMD::ParseIntegerSIMD(trimmedJson, actualLength, intValue)) {
      return Napi::Number::New(env, static_cast<double>(intValue));
    }
  }

  // SIMD character validation before expensive parsing
  if (!JsonSIMD::ValidateJsonChars_SIMD(json.c_str() + trimStart, actualLength)) {
    Napi::SyntaxError::New(env, "Invalid JSON characters detected").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Fast path for small documents with basic validation
  if (actualLength < 10) {
    // Try to parse as number
    try {
      double num = std::stod(json);
      return Napi::Number::New(env, num);
    } catch (...) {
      // Not a number, continue with normal parsing
    }
  }

  // Choose parser based on mode and document size
  try {
    if (parserMode_ == ParserMode::DOM ||
        (parserMode_ == ParserMode::AUTO && json.length() > 1024 * 1024)) {
      // Use DOM parser for larger documents or when explicitly requested
      return ParseWithDOM(env, json);
    } else {
      // Use OnDemand parser for smaller documents or when explicitly requested
      return ParseWithOnDemand(env, json);
    }
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// ParseBuffer method - handles Buffer input
Napi::Value JsonProcessor::ParseBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get buffer
  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();

  // Fast path for empty buffers
  if (buffer.Length() == 0) {
    return env.Null();
  }

  // Fast path for small documents
  if (buffer.Length() < 10) {
    std::string json(reinterpret_cast<const char*>(buffer.Data()), buffer.Length());
    if (json == "null") return env.Null();
    if (json == "true") return Napi::Boolean::New(env, true);
    if (json == "false") return Napi::Boolean::New(env, false);
    // Try to parse as number
    try {
      double num = std::stod(json);
      return Napi::Number::New(env, num);
    } catch (...) {
      // Not a number, continue with normal parsing
    }
  }

  // Choose parser based on mode and document size
  try {
    if (parserMode_ == ParserMode::DOM ||
        (parserMode_ == ParserMode::AUTO && buffer.Length() > 1024 * 1024)) {
      // Use DOM parser for larger documents or when explicitly requested
      return ParseWithDOM(env, buffer.Data(), buffer.Length());
    } else {
      // Use OnDemand parser for smaller documents or when explicitly requested
      return ParseWithOnDemand(env, buffer.Data(), buffer.Length());
    }
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Memory management helpers
void JsonProcessor::GrowStringBuffer(size_t newSize) {
  size_t currentSize = stringBuffer_.capacity();
  if (newSize > currentSize) {
    // Grow exponentially to reduce reallocations
    size_t targetSize = std::max(newSize, currentSize * 2);
    stringBuffer_.reserve(targetSize);
  }
}

// Get temporary buffer for number conversions
char* JsonProcessor::GetTempBuffer(size_t size) {
  // Ensure the buffer is large enough
  if (tempBufferSize_ < size) {
    if (tempBuffer_ != nullptr) {
      delete[] tempBuffer_;
    }

    // Allocate with some extra space to avoid frequent reallocations
    tempBufferSize_ = size * 2;
    tempBuffer_ = new char[tempBufferSize_];
  }

  return tempBuffer_;
}

// Stringify JSON
Napi::Value JsonProcessor::Stringify(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get value to stringify
  Napi::Value value = info[0];

  // Handle null and undefined
  if (value.IsNull() || value.IsUndefined()) {
    return Napi::String::New(env, "null");
  }

  // Fast path for primitives
  if (value.IsString()) {
    // For single strings, use fast stringify
    std::string result;
    result.reserve(value.As<Napi::String>().Utf8Value().length() + 10); // Add some padding
    StringifyString(value.As<Napi::String>().Utf8Value(), result);
    return Napi::String::New(env, result);
  }

  if (value.IsNumber()) {
    double numValue = value.As<Napi::Number>().DoubleValue();
    std::string result;
    result.reserve(32); // Reserve sufficient space for most numbers
    StringifyNumber(numValue, result);
    return Napi::String::New(env, result);
  }

  if (value.IsBoolean()) {
    return Napi::String::New(env, value.As<Napi::Boolean>().Value() ? "true" : "false");
  }

  // Fast path for common objects
  if (value.IsArray()) {
    Napi::Array array = value.As<Napi::Array>();

    // For empty arrays, return immediately
    if (array.Length() == 0) {
      return Napi::String::New(env, "[]");
    }

    // For small arrays, use normal string buffer
    if (array.Length() < 100) {
      std::string result;
      // Reserve some space based on array length (heuristic)
      result.reserve(array.Length() * 20);
      StringifyArrayFast(array, result);
      return Napi::String::New(env, result);
    }

    // For large arrays, use our string buffer pool
    GrowStringBuffer(array.Length() * 20); // Heuristic estimate
    StringifyArrayFast(array, stringBuffer_);
    return Napi::String::New(env, stringBuffer_);
  }

  if (value.IsObject() && !value.IsFunction() && !value.IsBuffer()) {
    Napi::Object object = value.As<Napi::Object>();
    Napi::Array properties = object.GetPropertyNames();

    // For empty objects, return immediately
    if (properties.Length() == 0) {
      return Napi::String::New(env, "{}");
    }

    // For small objects, use normal string buffer
    if (properties.Length() < 100) {
      std::string result;
      // Reserve some space based on properties count (heuristic)
      result.reserve(properties.Length() * 30);
      StringifyObjectFast(object, result);
      return Napi::String::New(env, result);
    }

    // For large objects, use our string buffer pool
    GrowStringBuffer(properties.Length() * 30); // Heuristic estimate
    StringifyObjectFast(object, stringBuffer_);
    return Napi::String::New(env, stringBuffer_);
  }

  if (value.IsBuffer()) {
    Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();

    // For small buffers, use normal string
    if (buffer.Length() < 100) {
      std::string result;
      // Each byte might take up to 5 chars (digit + comma + brackets)
      result.reserve(buffer.Length() * 5 + 2);
      result += '[';

      for (size_t i = 0; i < buffer.Length(); i++) {
        if (i > 0) {
          result += ',';
        }

        char numStr[8];
        int len = snprintf(numStr, sizeof(numStr), "%u", buffer.Data()[i]);
        result.append(numStr, len);
      }

      result += ']';
      return Napi::String::New(env, result);
    }

    // For large buffers, use string buffer
    size_t estimatedSize = buffer.Length() * 5 + 2;
    GrowStringBuffer(estimatedSize);

    stringBuffer_ = '[';

    for (size_t i = 0; i < buffer.Length(); i++) {
      if (i > 0) {
        stringBuffer_ += ',';
      }

      char* numStr = GetTempBuffer(8);
      int len = snprintf(numStr, 8, "%u", buffer.Data()[i]);
      stringBuffer_.append(numStr, len);
    }

    stringBuffer_ += ']';
    return Napi::String::New(env, stringBuffer_);
  }

  // Fallback to general stringification for other types
  // Only use string buffer for potentially large objects
  stringBuffer_.clear();
  StringifyValue(value, stringBuffer_);
  return Napi::String::New(env, stringBuffer_);
}

// Helper method to stringify a value to JSON - with optimizations
void JsonProcessor::StringifyValue(const Napi::Value& value, std::string& result) {
  if (value.IsNull() || value.IsUndefined()) {
    result += "null";
  } else if (value.IsBoolean()) {
    bool boolValue = value.As<Napi::Boolean>().Value();
    result += boolValue ? "true" : "false";
  } else if (value.IsNumber()) {
    double numValue = value.As<Napi::Number>().DoubleValue();

    // Handle integer vs. float formatting
    if (std::floor(numValue) == numValue &&
        numValue <= 9007199254740991.0 &&
        numValue >= -9007199254740991.0) {
      // It's an integer within safe integer range
      // Use faster integer to string conversion
      char* buffer = GetTempBuffer(32);
      int len = snprintf(buffer, 32, "%" PRId64, static_cast<int64_t>(numValue));
      result.append(buffer, len);
    } else {
      // Format as double, ensuring we don't lose precision
      char* buffer = GetTempBuffer(32);
      int len = snprintf(buffer, 32, "%.16g", numValue);
      result.append(buffer, len);
    }
  } else if (value.IsString()) {
    std::string strValue = value.As<Napi::String>().Utf8Value();
    result += '"';

    // Check if we can use the fast path (no escaping needed)
    bool needsEscaping = false;
    for (char c : strValue) {
      if (c == '"' || c == '\\' || c == '\b' || c == '\f' ||
          c == '\n' || c == '\r' || c == '\t' || static_cast<unsigned char>(c) < 32) {
        needsEscaping = true;
        break;
      }
    }

    if (!needsEscaping) {
      // Fast path - no escaping needed
      result.append(strValue);
    } else {
      // Slow path - escape special characters
      for (char c : strValue) {
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
              char* buffer = GetTempBuffer(8);
              snprintf(buffer, 8, "\\u%04x", static_cast<unsigned char>(c));
              result.append(buffer, 6);
            } else {
              result += c;
            }
        }
      }
    }

    result += '"';
  } else if (value.IsArray()) {
    Napi::Array array = value.As<Napi::Array>();
    result += '[';

    uint32_t length = array.Length();
    for (uint32_t i = 0; i < length; i++) {
      if (i > 0) {
        result += ',';
      }
      StringifyValue(array[i], result);
    }

    result += ']';
  } else if (value.IsObject() && !value.IsFunction() && !value.IsBuffer()) {
    Napi::Object object = value.As<Napi::Object>();
    result += '{';

    Napi::Array properties = object.GetPropertyNames();
    uint32_t length = properties.Length();

    // Process all properties
    for (uint32_t i = 0; i < length; i++) {
      if (i > 0) {
        result += ',';
      }

      Napi::Value key = properties[i];
      Napi::Value propertyValue = object.Get(key);

      // Skip functions
      if (propertyValue.IsFunction()) {
        continue;
      }

      // Add key
      result += '"';
      result.append(key.As<Napi::String>().Utf8Value());
      result += '"';
      result += ':';

      // Add value
      StringifyValue(propertyValue, result);
    }

    result += '}';
  } else if (value.IsBuffer()) {
    // Convert buffer to array for JSON serialization
    Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();
    result += '[';

    // Process buffer
    size_t length = buffer.Length();
    const uint8_t* data = buffer.Data();

    // For very large buffers, estimate the size and pre-allocate
    if (length > 1000) {
      // Each byte takes approximately 4 chars (digit + comma)
      size_t estimatedSize = result.size() + length * 4;
      GrowStringBuffer(estimatedSize);
    }

    // Process all bytes
    for (size_t i = 0; i < length; i++) {
      if (i > 0) {
        result += ',';
      }

      // Use faster integer to string conversion
      char* numStr = GetTempBuffer(8);
      int len = snprintf(numStr, 8, "%u", data[i]);
      result.append(numStr, len);
    }

    result += ']';
  } else {
    // Default for unsupported types (functions etc.)
    result += "null";
  }
}

// Convert DOM element to NAPI value
Napi::Value JsonProcessor::ConvertDOMValueToNapi(const Napi::Env& env, simdjson::dom::element element) {
  switch (element.type()) {
    case simdjson::dom::element_type::ARRAY: {
      simdjson::dom::array array = element.get_array().value();
      Napi::Array napiArray = Napi::Array::New(env);

      // Convert each element in the array
      size_t index = 0;
      for (auto value : array) {
        napiArray.Set(index++, ConvertDOMValueToNapi(env, value));
      }

      return napiArray;
    }

    case simdjson::dom::element_type::OBJECT: {
      simdjson::dom::object object = element.get_object().value();
      Napi::Object napiObject = Napi::Object::New(env);

      // Convert each property in the object
      for (auto field : object) {
        std::string_view key = field.key;
        napiObject.Set(key.data(), ConvertDOMValueToNapi(env, field.value));
      }

      return napiObject;
    }

    case simdjson::dom::element_type::INT64: {
      int64_t intValue = element.get_int64().value();
      // Check if it fits in a 32-bit integer, which is more efficient in JS
      if (intValue >= INT32_MIN && intValue <= INT32_MAX) {
        return Napi::Number::New(env, static_cast<int32_t>(intValue));
      }
      return Napi::Number::New(env, static_cast<double>(intValue));
    }

    case simdjson::dom::element_type::UINT64: {
      uint64_t uintValue = element.get_uint64().value();
      // Check if it fits in a 32-bit integer
      if (uintValue <= INT32_MAX) {
        return Napi::Number::New(env, static_cast<int32_t>(uintValue));
      }
      return Napi::Number::New(env, static_cast<double>(uintValue));
    }

    case simdjson::dom::element_type::DOUBLE: {
      double doubleValue = element.get_double().value();
      return Napi::Number::New(env, doubleValue);
    }

    case simdjson::dom::element_type::STRING: {
      std::string_view stringValue = element.get_string().value();
      return Napi::String::New(env, stringValue.data(), stringValue.length());
    }

    case simdjson::dom::element_type::BOOL: {
      bool boolValue = element.get_bool().value();
      return Napi::Boolean::New(env, boolValue);
    }

    case simdjson::dom::element_type::NULL_VALUE: {
      return env.Null();
    }

    default:
      return env.Undefined();
  }
}

// Parse stream of JSON objects (actually just parses a JSON array for now)
Napi::Value JsonProcessor::ParseStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Check if input is a buffer or string
  if (!info[0].IsBuffer() && !info[0].IsString() && !info[0].IsArray()) {
    Napi::TypeError::New(env, "Buffer, string, or array expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Handle array input (already parsed JSON)
  if (info[0].IsArray()) {
    return info[0];
  }

  // Get the string or buffer content
  std::string jsonData;
  if (info[0].IsBuffer()) {
    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    jsonData = std::string(reinterpret_cast<const char*>(buffer.Data()), buffer.Length());
  } else {
    jsonData = info[0].As<Napi::String>().Utf8Value();
  }

  // Validate that this is an array
  if (jsonData.empty() || jsonData[0] != '[' || jsonData[jsonData.length() - 1] != ']') {
    Napi::TypeError::New(env, "Input must be a JSON array").ThrowAsJavaScriptException();
    return env.Null();
  }

  try {
    // Parse as a regular JSON array
    // Use DOM parser for all cases for now
    simdjson::padded_string padded(jsonData);
    auto result = dom_parser_.parse(padded);
    if (result.error()) {
      Napi::Error::New(env, std::string("JSON parse error: ") +
                       simdjson::error_message(result.error())).ThrowAsJavaScriptException();
      return env.Null();
    }

    // Convert to NAPI array
    return ConvertDOMValueToNapi(env, result.value());
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Stringify stream of JSON objects
Napi::Value JsonProcessor::StringifyStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "Array expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Array array = info[0].As<Napi::Array>();
  uint32_t length = array.Length();

  // Early return for empty array
  if (length == 0) {
    return Napi::String::New(env, "");
  }

  try {
    // Estimate the size of the output
    // Assume each item might take around 100 bytes (reasonable estimate)
    size_t estimatedSize = length * 100;
    GrowStringBuffer(estimatedSize);

    // Process each item
    for (uint32_t i = 0; i < length; i++) {
      // Add newline between items
      if (i > 0) {
        stringBuffer_ += '\n';
      }

      // Get value
      Napi::Value value = array[i];

      // Convert to JSON and append
      if (value.IsString()) {
        StringifyString(value.As<Napi::String>().Utf8Value(), stringBuffer_);
      } else if (value.IsNumber()) {
        StringifyNumber(value.As<Napi::Number>().DoubleValue(), stringBuffer_);
      } else if (value.IsBoolean()) {
        StringifyBoolean(value.As<Napi::Boolean>().Value(), stringBuffer_);
      } else if (value.IsNull() || value.IsUndefined()) {
        stringBuffer_ += "null";
      } else if (value.IsObject() && !value.IsFunction()) {
        if (value.IsArray()) {
          StringifyArrayFast(value.As<Napi::Array>(), stringBuffer_);
        } else if (value.IsBuffer()) {
          // Handle buffer
          Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();

          stringBuffer_ += '[';

          for (size_t j = 0; j < buffer.Length(); j++) {
            if (j > 0) {
              stringBuffer_ += ',';
            }

            char* numStr = GetTempBuffer(8);
            int len = snprintf(numStr, 8, "%u", buffer.Data()[j]);
            stringBuffer_.append(numStr, len);
          }

          stringBuffer_ += ']';
        } else {
          // Regular object
          StringifyObjectFast(value.As<Napi::Object>(), stringBuffer_);
        }
      } else {
        // Skip functions or other unsupported types
        stringBuffer_ += "null";
      }
    }

    // Return the result
    return Napi::String::New(env, stringBuffer_);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Parse with DOM API - string input
Napi::Value JsonProcessor::ParseWithDOM(const Napi::Env& env, const std::string& json) {
  // Use DOM parser
  auto result = dom_parser_.parse(json);
  if (result.error()) {
    std::string errorMsg = std::string("JSON parse error: ") + simdjson::error_message(result.error());
    Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
    return env.Null();
  }

  // Convert to NAPI value
  return ConvertDOMValueToNapi(env, result.value());
}

// Parse with DOM API - buffer input
Napi::Value JsonProcessor::ParseWithDOM(const Napi::Env& env, const uint8_t* data, size_t length) {
  // Use DOM parser
  auto result = dom_parser_.parse(data, length);
  if (result.error()) {
    std::string errorMsg = std::string("JSON parse error: ") + simdjson::error_message(result.error());
    Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
    return env.Null();
  }

  // Convert to NAPI value
  return ConvertDOMValueToNapi(env, result.value());
}

// Parse with OnDemand API - string input
Napi::Value JsonProcessor::ParseWithOnDemand(const Napi::Env& env, const std::string& json) {
  // Create a padded string for simdjson
  simdjson::padded_string padded(json);

  // Parse with OnDemand parser
  auto result = ondemand_parser_.iterate(padded);
  if (result.error()) {
    std::string errorMsg = std::string("JSON parse error: ") + simdjson::error_message(result.error());
    Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
    return env.Null();
  }

  try {
    // Parse the document
    auto result = dom_parser_.parse(padded);
    if (result.error()) {
      std::string errorMsg = std::string("JSON parse error: ") + simdjson::error_message(result.error());
      Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
      return env.Null();
    }

    // Convert directly to NAPI value using DOM API
    return ConvertDOMValueToNapi(env, result.value());
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Parse with OnDemand API - buffer input
Napi::Value JsonProcessor::ParseWithOnDemand(const Napi::Env& env, const uint8_t* data, size_t length) {
  // Create a padded string for simdjson
  simdjson::padded_string padded(reinterpret_cast<const char*>(data), length);

  try {
    // Parse the document
    auto result = dom_parser_.parse(padded);
    if (result.error()) {
      std::string errorMsg = std::string("JSON parse error: ") + simdjson::error_message(result.error());
      Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
      return env.Null();
    }

    // Convert directly to NAPI value using DOM API
    return ConvertDOMValueToNapi(env, result.value());
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Implementation for string type
void JsonProcessor::StringifyString(const std::string& value, std::string& result) {
  // Check if we can use the fast path (no escaping needed)
  bool needsEscaping = false;
  for (char c : value) {
    if (c == '"' || c == '\\' || static_cast<unsigned char>(c) < 32) {
      needsEscaping = true;
      break;
    }
  }

  result += '"';

  if (!needsEscaping) {
    // Fast path - no escaping needed
    result += value;
  } else {
    // Slow path - escaping needed
    for (char c : value) {
      switch (c) {
        case '"':
          result += "\\\"";
          break;
        case '\\':
          result += "\\\\";
          break;
        case '\b':
          result += "\\b";
          break;
        case '\f':
          result += "\\f";
          break;
        case '\n':
          result += "\\n";
          break;
        case '\r':
          result += "\\r";
          break;
        case '\t':
          result += "\\t";
          break;
        default:
          if (static_cast<unsigned char>(c) < 32) {
            // Format control characters as \u00XX
            char buf[7];
            std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
            result += buf;
          } else {
            result += c;
          }
          break;
      }
    }
  }

  result += '"';
}

// Implementation for number type
void JsonProcessor::StringifyNumber(double value, std::string& result) {
  // Check for special cases
  if (std::isnan(value)) {
    result += "null"; // JSON doesn't support NaN
    return;
  }

  if (std::isinf(value)) {
    if (value > 0) {
      result += "null"; // JSON doesn't support Infinity
    } else {
      result += "null"; // JSON doesn't support -Infinity
    }
    return;
  }

  // Check if it's an integer (no decimal part)
  if (std::floor(value) == value && value <= INT32_MAX && value >= INT32_MIN) {
    // Convert integer directly
    result += std::to_string(static_cast<int32_t>(value));
    return;
  }

  // Use custom formatting for better precision
  char* buffer = GetTempBuffer(32);
  int len = std::snprintf(buffer, 32, "%.16g", value);
  result.append(buffer, len);
}

// Implementation for boolean type
void JsonProcessor::StringifyBoolean(bool value, std::string& result) {
  result += value ? "true" : "false";
}

// Stringify JS object to JSON
void JsonProcessor::StringifyObjectFast(Napi::Object object, std::string& result) {
  result += '{';

  Napi::Array properties = object.GetPropertyNames();
  const uint32_t length = properties.Length();

  for (uint32_t i = 0; i < length; i++) {
    if (i > 0) {
      result += ',';
    }

    // Get property
    Napi::Value key = properties[i];
    Napi::Value value = object.Get(key);

    // Skip functions or undefined values
    if (value.IsFunction() || value.IsUndefined()) {
      continue;
    }

    // Add key
    StringifyString(key.As<Napi::String>().Utf8Value(), result);
    result += ':';

    // Add value based on type
    if (value.IsNull()) {
      result += "null";
    } else if (value.IsString()) {
      StringifyString(value.As<Napi::String>().Utf8Value(), result);
    } else if (value.IsNumber()) {
      StringifyNumber(value.As<Napi::Number>().DoubleValue(), result);
    } else if (value.IsBoolean()) {
      StringifyBoolean(value.As<Napi::Boolean>().Value(), result);
    } else if (value.IsArray()) {
      StringifyArrayFast(value.As<Napi::Array>(), result);
    } else if (value.IsObject() && !value.IsBuffer() && !value.IsDate()) {
      StringifyObjectFast(value.As<Napi::Object>(), result);
    } else if (value.IsBuffer()) {
      // Convert buffer to array
      Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();
      result += '[';
      for (size_t j = 0; j < buffer.Length(); j++) {
        if (j > 0) {
          result += ',';
        }
        result += std::to_string(buffer.Data()[j]);
      }
      result += ']';
    } else {
      // Default to string representation
      result += "null";
    }
  }

  result += '}';
}

// Stringify JS array to JSON
void JsonProcessor::StringifyArrayFast(Napi::Array array, std::string& result) {
  result += '[';

  const uint32_t length = array.Length();

  for (uint32_t i = 0; i < length; i++) {
    if (i > 0) {
      result += ',';
    }

    Napi::Value value = array[i];

    // Handle each value type
    if (value.IsUndefined() || value.IsNull()) {
      result += "null";
    } else if (value.IsString()) {
      StringifyString(value.As<Napi::String>().Utf8Value(), result);
    } else if (value.IsNumber()) {
      StringifyNumber(value.As<Napi::Number>().DoubleValue(), result);
    } else if (value.IsBoolean()) {
      StringifyBoolean(value.As<Napi::Boolean>().Value(), result);
    } else if (value.IsArray()) {
      StringifyArrayFast(value.As<Napi::Array>(), result);
    } else if (value.IsObject() && !value.IsBuffer() && !value.IsDate()) {
      StringifyObjectFast(value.As<Napi::Object>(), result);
    } else if (value.IsBuffer()) {
      // Convert buffer to array
      Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();
      result += '[';
      for (size_t j = 0; j < buffer.Length(); j++) {
        if (j > 0) {
          result += ',';
        }
        result += std::to_string(buffer.Data()[j]);
      }
      result += ']';
    } else {
      // Default to null for unsupported types
      result += "null";
    }
  }

  result += ']';
}
