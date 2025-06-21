#include "http_parser.h"
#include <algorithm>
#include <cctype>
#include <sstream>
#include <string_view>
#include <array>

// Add SIMD includes
#ifdef __x86_64__
#include <immintrin.h>
#include <x86intrin.h>
#elif defined(__aarch64__)
#include <arm_neon.h>
#endif

// Initialize static constants and helpers
Napi::Object HttpParser::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "HttpParser", {
    InstanceMethod("parseRequest", &HttpParser::ParseRequest),
    InstanceMethod("parseHeaders", &HttpParser::ParseHeaders),
    InstanceMethod("parseBody", &HttpParser::ParseBody),
    InstanceMethod("reset", &HttpParser::Reset),
    InstanceMethod("getPerformanceMetrics", &HttpParser::GetPerformanceMetrics),
    InstanceMethod("resetPerformanceMetrics", &HttpParser::ResetPerformanceMetrics)
  });

  exports.Set("HttpParser", func);

  return exports;
}

// Constructor
HttpParser::HttpParser(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<HttpParser>(info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Pre-allocate vectors to reduce allocations with larger capacity
  headers_.reserve(64);  // Increased from 32
  body_.reserve(8192);   // Increased from 4096

  // Initialize header names map with common headers for quick comparison
  headerNames_ = {
    {std::string(HEADER_HOST), "Host"},
    {std::string(HEADER_CONTENT_TYPE), "Content-Type"},
    {std::string(HEADER_CONTENT_LENGTH), "Content-Length"},
    {std::string(HEADER_USER_AGENT), "User-Agent"},
    {std::string(HEADER_ACCEPT), "Accept"},
    {std::string(HEADER_CONNECTION), "Connection"},
    {std::string(HEADER_COOKIE), "Cookie"},
    {std::string(HEADER_AUTHORIZATION), "Authorization"},
    {std::string(HEADER_ACCEPT_ENCODING), "Accept-Encoding"},
    {std::string(HEADER_ACCEPT_LANGUAGE), "Accept-Language"},
    {std::string(HEADER_CACHE_CONTROL), "Cache-Control"},
    {std::string(HEADER_ORIGIN), "Origin"},
    {std::string(HEADER_REFERER), "Referer"},
    {std::string(HEADER_IF_NONE_MATCH), "If-None-Match"},
    {std::string(HEADER_IF_MODIFIED_SINCE), "If-Modified-Since"},
    {std::string(HEADER_X_REQUESTED_WITH), "X-Requested-With"},
    {std::string(HEADER_X_FORWARDED_FOR), "X-Forwarded-For"},
    {std::string(HEADER_X_FORWARDED_PROTO), "X-Forwarded-Proto"},
    {std::string(HEADER_X_FORWARDED_HOST), "X-Forwarded-Host"},
    {std::string(HEADER_CONTENT_ENCODING), "Content-Encoding"},
    {std::string(HEADER_TRANSFER_ENCODING), "Transfer-Encoding"},
    {std::string(HEADER_VARY), "Vary"},
    {std::string(HEADER_ETAG), "ETag"},
    {std::string(HEADER_LAST_MODIFIED), "Last-Modified"},
    {std::string(HEADER_SERVER), "Server"},
    {std::string(HEADER_DATE), "Date"},
    {std::string(HEADER_EXPIRES), "Expires"},
    {std::string(HEADER_SET_COOKIE), "Set-Cookie"}
  };

  // Initialize lowercase map for case-insensitive comparison
  InitializeLowercaseMap();

  // Pre-compile common patterns for faster matching
  InitializeOptimizedPatterns();

  // Check if we are passed an object pool instance
  if (info.Length() > 0 && info[0].IsObject()) {
    objectPool_ = Napi::Reference<Napi::Object>::New(info[0].As<Napi::Object>(), 1);
    useObjectPool_ = true;
  } else {
    useObjectPool_ = false;
  }

  // Initialize performance counters
  parseCount_ = 0;
  totalParseTime_ = 0;
  headerParseTime_ = 0;
  bodyParseTime_ = 0;
  simdOptimizedOperations_ = 0;

  // Reset parser state
  Reset();
}

// Initialize a lookup table for faster case conversion
void HttpParser::InitializeLowercaseMap() {
  // Initialize the lowercase conversion lookup table
  for (int i = 0; i < 256; i++) {
    lowercaseMap_[i] = i;
  }

  // Set lowercase mappings for uppercase ASCII characters
  for (int i = 'A'; i <= 'Z'; i++) {
    lowercaseMap_[i] = i + 32;
  }
}

// Case insensitive string comparison using lookup table
bool HttpParser::CaseInsensitiveCompare(const std::string& a, const std::string& b) const {
  if (a.length() != b.length()) {
    return false;
  }

  for (size_t i = 0; i < a.length(); i++) {
    if (lowercaseMap_[static_cast<unsigned char>(a[i])] !=
        lowercaseMap_[static_cast<unsigned char>(b[i])]) {
      return false;
    }
  }

  return true;
}

// Fast lowercase conversion using lookup table
std::string HttpParser::ToLowercase(const std::string_view& input) const {
  std::string result;
  result.reserve(input.length());

  for (char c : input) {
    result.push_back(lowercaseMap_[static_cast<unsigned char>(c)]);
  }

  return result;
}

// Reset parser state
void HttpParser::Reset() {
  headers_.clear();
  body_.clear();

  // Reset parser state
  headerComplete_ = false;
  contentLength_ = 0;

  // Reset buffer state
  currentBuffer_ = nullptr;
  bufferLength_ = 0;
  bufferOffset_ = 0;
  bodyOffset_ = 0;
  headerEndOffset_ = 0;
  isComplete_ = false;
  upgrade_ = false;
  chunkedEncoding_ = false;
}

// Initialize optimized patterns for common HTTP elements
void HttpParser::InitializeOptimizedPatterns() {
  // Pre-compile SIMD patterns for common sequences - only for x86_64
#ifdef __x86_64__
  // Pattern for "\r\n\r\n" (end of headers)
  headerEndPattern_ = _mm_set_epi8(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '\n', '\r', '\n', '\r');

  // Pattern for "\r\n" (line endings)
  lineEndPattern_ = _mm_set_epi16(0, 0, 0, 0, 0, 0, 0x0A0D, 0x0A0D); // \r\n in little endian

  // Pattern for ": " (header separator)
  headerSepPattern_ = _mm_set_epi16(0, 0, 0, 0, 0, 0, 0, 0x203A); // ": " in little endian
#endif

  // Pre-calculate method lengths for faster parsing
  methodLengths_["GET"] = 3;
  methodLengths_["POST"] = 4;
  methodLengths_["PUT"] = 3;
  methodLengths_["DELETE"] = 6;
  methodLengths_["HEAD"] = 4;
  methodLengths_["OPTIONS"] = 7;
  methodLengths_["PATCH"] = 5;
  methodLengths_["TRACE"] = 5;
  methodLengths_["CONNECT"] = 7;
}

// SIMD-optimized string searching
size_t HttpParser::FindPatternSIMD(const char* data, size_t length, const char* pattern, size_t patternLen) {
  // For ARM64, use simplified NEON operations for single character search only
#ifdef __aarch64__
  if (length >= 16 && patternLen == 1) {
    // Single character search using NEON
    uint8x16_t targetVec = vdupq_n_u8(pattern[0]);

    for (size_t i = 0; i <= length - 16; i += 16) {
      uint8x16_t dataVec = vld1q_u8(reinterpret_cast<const uint8_t*>(data + i));
      uint8x16_t cmpResult = vceqq_u8(dataVec, targetVec);

      // Check if any byte matches
      uint64x2_t result64 = vreinterpretq_u64_u8(cmpResult);
      uint64_t mask = vgetq_lane_u64(result64, 0) | vgetq_lane_u64(result64, 1);

      if (mask != 0) {
        // Find first match in the 16-byte chunk
        for (size_t j = 0; j < 16; j++) {
          if (data[i + j] == pattern[0]) {
            simdOptimizedOperations_++;
            return i + j;
          }
        }
      }
    }

    // Handle remaining bytes
    for (size_t i = (length / 16) * 16; i < length; i++) {
      if (data[i] == pattern[0]) {
        return i;
      }
    }
    return std::string::npos;
  }
#elif defined(__x86_64__)
  if (length < 16 || patternLen > 16) {
    // Fallback to standard search for small data or long patterns
    return FindPatternStandard(data, length, pattern, patternLen);
  }

  __m128i patternVec = _mm_loadu_si128(reinterpret_cast<const __m128i*>(pattern));

  for (size_t i = 0; i <= length - 16; i += 16) {
    __m128i dataVec = _mm_loadu_si128(reinterpret_cast<const __m128i*>(data + i));
    __m128i cmpResult = _mm_cmpeq_epi8(dataVec, patternVec);

    int mask = _mm_movemask_epi8(cmpResult);
    if (mask != 0) {
      // Found potential match, verify
      for (int j = 0; j < 16; ++j) {
        if ((mask & (1 << j)) && i + j + patternLen <= length) {
          if (std::memcmp(data + i + j, pattern, patternLen) == 0) {
            simdOptimizedOperations_++;
            return i + j;
          }
        }
      }
    }
  }

  // Check remainder
  if (length > 16) {
    size_t remainder = length % 16;
    if (remainder >= patternLen) {
      size_t pos = FindPatternStandard(data + length - remainder, remainder, pattern, patternLen);
      if (pos != std::string::npos) {
        return (length - remainder) + pos;
      }
    }
  }
#endif

  // Fallback to standard search for all other cases or unsupported platforms
  return FindPatternStandard(data, length, pattern, patternLen);
}

// Standard string search fallback
size_t HttpParser::FindPatternStandard(const char* data, size_t length, const char* pattern, size_t patternLen) {
  for (size_t i = 0; i <= length - patternLen; ++i) {
    if (std::memcmp(data + i, pattern, patternLen) == 0) {
      return i;
    }
  }
  return std::string::npos;
}

// Optimized request line parsing with SIMD
bool HttpParser::ParseRequestLineOptimized(Napi::Env env, Napi::Object& result) {
  auto startTime = std::chrono::high_resolution_clock::now();

  const char* data = currentBuffer_;
  size_t remaining = bufferLength_;

  // Find first space (end of method) using SIMD
  size_t methodEnd = FindPatternSIMD(data, std::min(remaining, size_t(16)), " ", 1);
  if (methodEnd == std::string::npos) {
    return false;
  }

  // Extract method with zero-copy if possible
  std::string_view method(data, methodEnd);

  // Validate method using pre-calculated lengths
  auto methodIt = methodLengths_.find(std::string(method));
  if (methodIt == methodLengths_.end()) {
    // Unknown method, use slower validation
    if (!IsValidMethod(method)) {
      return false;
    }
  }

  result.Set("method", Napi::String::New(env, std::string(method)));

  // Find second space (end of URL)
  size_t urlStart = methodEnd + 1;
  size_t urlEnd = FindPatternSIMD(data + urlStart, remaining - urlStart, " ", 1);
  if (urlEnd == std::string::npos) {
    return false;
  }
  urlEnd += urlStart;

  // Extract URL
  std::string_view url(data + urlStart, urlEnd - urlStart);
  result.Set("url", Napi::String::New(env, std::string(url)));

  // Find line ending
  size_t versionStart = urlEnd + 1;
  size_t lineEnd = FindPatternSIMD(data + versionStart, remaining - versionStart, "\r\n", 2);
  if (lineEnd == std::string::npos) {
    return false;
  }
  lineEnd += versionStart;

  // Extract version
  std::string_view version(data + versionStart, lineEnd - versionStart);
  result.Set("version", Napi::String::New(env, std::string(version)));

  bufferOffset_ = lineEnd + 2; // Skip \r\n

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);
  totalParseTime_ += duration.count();

  return true;
}

// Vectorized header parsing
bool HttpParser::ParseHeadersOptimized(Napi::Env env, Napi::Object& headers) {
  auto startTime = std::chrono::high_resolution_clock::now();

  const char* data = currentBuffer_ + bufferOffset_;
  size_t remaining = bufferLength_ - bufferOffset_;

  // Find end of headers using SIMD
  size_t headersEnd = FindPatternSIMD(data, remaining, "\r\n\r\n", 4);
  if (headersEnd == std::string::npos) {
    return false;
  }

  headerEndOffset_ = bufferOffset_ + headersEnd + 4;
  size_t pos = 0;

  // Parse headers line by line with optimizations
  while (pos < headersEnd) {
    // Find line end
    size_t lineEnd = FindPatternSIMD(data + pos, headersEnd - pos, "\r\n", 2);
    if (lineEnd == std::string::npos) {
      break;
    }
    lineEnd += pos;

    if (lineEnd == pos) {
      // Empty line, end of headers
      break;
    }

    // Find header separator
    size_t sepPos = FindPatternSIMD(data + pos, lineEnd - pos, ": ", 2);
    if (sepPos == std::string::npos) {
      // Invalid header, skip
      pos = lineEnd + 2;
      continue;
    }
    sepPos += pos;

    // Extract header name and value with zero-copy views
    std::string_view headerName(data + pos, sepPos - pos);
    std::string_view headerValue(data + sepPos + 2, lineEnd - sepPos - 2);

    // Optimize common headers with pre-computed keys
    std::string headerKey = ToLowercase(headerName);
    auto commonIt = headerNames_.find(headerKey);
    if (commonIt != headerNames_.end()) {
      headers.Set(commonIt->second, Napi::String::New(env, std::string(headerValue)));
    } else {
      headers.Set(headerKey, Napi::String::New(env, std::string(headerValue)));
    }

    pos = lineEnd + 2; // Skip \r\n
  }

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);
  headerParseTime_ += duration.count();

  return true;
}

// Enhanced main parsing method with performance optimizations
Napi::Value HttpParser::ParseRequest(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  auto totalStartTime = std::chrono::high_resolution_clock::now();

  // Check arguments
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the buffer
  Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();

  // Store the buffer for later use and reset state
  currentBuffer_ = buffer.Data();
  bufferLength_ = buffer.Length();
  bufferOffset_ = 0;
  bodyOffset_ = 0;
  headerEndOffset_ = 0;

  // Store the buffer reference to prevent GC
  if (!bufferRef_.IsEmpty()) {
    bufferRef_.Unref();
  }
  bufferRef_ = Napi::Persistent(buffer);

  // Create the result object
  Napi::Object result = Napi::Object::New(env);

  // Parse the request line with SIMD optimizations
  try {
    if (!ParseRequestLineOptimized(env, result)) {
      Napi::Error::New(env, "Failed to parse request line").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Parse the headers with vectorized operations
    Napi::Object headers = GetHeadersObject(env);
    if (!ParseHeadersOptimized(env, headers)) {
      ReleaseHeadersObject(headers);
      Napi::Error::New(env, "Failed to parse headers").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Add headers to result
    result.Set("headers", headers);

    // Check for upgrade with optimized string comparison
    if (headers.Has(std::string(HEADER_CONNECTION))) {
      std::string_view connection = GetHeaderValueView(std::string(HEADER_CONNECTION));
      upgrade_ = FastStringEqual(connection, "upgrade");
    }
    result.Set("upgrade", Napi::Boolean::New(env, upgrade_));

    // Check for content-length with fast parsing
    if (headers.Has(std::string(HEADER_CONTENT_LENGTH))) {
      std::string_view contentLengthStr = GetHeaderValueView(std::string(HEADER_CONTENT_LENGTH));
      contentLength_ = FastStringToInt(contentLengthStr);
    }

    // Check for chunked encoding
    if (headers.Has(std::string(HEADER_TRANSFER_ENCODING))) {
      std::string_view transferEncoding = GetHeaderValueView(std::string(HEADER_TRANSFER_ENCODING));
      chunkedEncoding_ = FastStringEqual(transferEncoding, "chunked");
    }
    result.Set("chunked", Napi::Boolean::New(env, chunkedEncoding_));

    // Set body offset for potential body parsing
    bodyOffset_ = headerEndOffset_;
    result.Set("bodyOffset", Napi::Number::New(env, bodyOffset_));

    // Calculate and store performance metrics
    auto totalEndTime = std::chrono::high_resolution_clock::now();
    auto totalDuration = std::chrono::duration_cast<std::chrono::microseconds>(totalEndTime - totalStartTime);

    parseCount_++;
    totalParseTime_ += totalDuration.count();

    result.Set("parseTime", Napi::Number::New(env, totalDuration.count()));
    result.Set("simdOptimized", Napi::Number::New(env, simdOptimizedOperations_));

    return result;

  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Parse headers from buffer
Napi::Value HttpParser::ParseHeaders(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the buffer
  Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();

  // Store the buffer for later use
  currentBuffer_ = buffer.Data();
  bufferLength_ = buffer.Length();
  bufferOffset_ = 0;

  // Create headers object
  Napi::Object headers = GetHeadersObject(env);

  // Parse headers
  if (!ParseHeaders(env, headers)) {
    ReleaseHeadersObject(headers);
    Napi::Error::New(env, "Failed to parse headers").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return headers;
}

// Parse body from buffer
Napi::Value HttpParser::ParseBody(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the buffer
  Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();

  // Store the buffer for later use
  currentBuffer_ = buffer.Data();
  bufferLength_ = buffer.Length();
  bufferOffset_ = 0;

  // Get content length from options if provided
  size_t length = 0;
  if (info.Length() >= 2 && info[1].IsObject()) {
    Napi::Object options = info[1].As<Napi::Object>();
    if (options.Has("contentLength") && options.Get("contentLength").IsNumber()) {
      length = options.Get("contentLength").As<Napi::Number>().Uint32Value();
    }
  }

  // If no content length or invalid, use the whole buffer
  if (length == 0) {
    length = bufferLength_;
  }

  // Create buffer with the body content
  Napi::Buffer<char> body = GetBuffer(env, length);
  memcpy(body.Data(), currentBuffer_, std::min(length, bufferLength_));

  return body;
}

// Reset the parser state
Napi::Value HttpParser::Reset(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  Reset();

  return env.Undefined();
}

// Helper method to get a buffer from the object pool
Napi::Buffer<char> HttpParser::GetBuffer(Napi::Env env, size_t size) {
  if (useObjectPool_) {
    // Create arguments array for the getBuffer method
    std::vector<napi_value> args = { Napi::Number::New(env, size) };

    // Call the getBuffer method on the object pool
    Napi::Value result = objectPool_.Value().As<Napi::Object>().Get("getBuffer").As<Napi::Function>().Call(objectPool_.Value(), args);

    // Return the buffer
    return result.As<Napi::Buffer<char>>();
  } else {
    // Create a new buffer
    return Napi::Buffer<char>::New(env, size);
  }
}

// Helper method to release a buffer back to the pool
void HttpParser::ReleaseBuffer(Napi::Buffer<char> buffer) {
  if (useObjectPool_) {
    // Create arguments array for the releaseBuffer method
    std::vector<napi_value> args = { buffer };

    // Call the releaseBuffer method on the object pool
    objectPool_.Value().As<Napi::Object>().Get("releaseBuffer").As<Napi::Function>().Call(objectPool_.Value(), args);
  }
}

// Helper method to get a headers object from the pool
Napi::Object HttpParser::GetHeadersObject(Napi::Env env) {
  if (useObjectPool_) {
    // Call the getHeadersObject method on the object pool
    Napi::Value result = objectPool_.Value().As<Napi::Object>().Get("getHeadersObject").As<Napi::Function>().Call(objectPool_.Value(), {});

    // Return the headers object
    return result.As<Napi::Object>();
  } else {
    // Create a new object
    return Napi::Object::New(env);
  }
}

// Helper method to release a headers object back to the pool
void HttpParser::ReleaseHeadersObject(Napi::Object headersObj) {
  if (useObjectPool_) {
    // Create arguments array for the releaseHeadersObject method
    std::vector<napi_value> args = { headersObj };

    // Call the releaseHeadersObject method on the object pool
    objectPool_.Value().As<Napi::Object>().Get("releaseHeadersObject").As<Napi::Function>().Call(objectPool_.Value(), args);
  }
}

// Helper methods for string views
std::string_view HttpParser::CreateStringView(size_t start, size_t length) {
  if (start >= bufferLength_) {
    return std::string_view();
  }

  if (start + length > bufferLength_) {
    length = bufferLength_ - start;
  }

  return std::string_view(currentBuffer_ + start, length);
}

std::string_view HttpParser::CreateStringView(size_t start) {
  if (start >= bufferLength_) {
    return std::string_view();
  }

  return std::string_view(currentBuffer_ + start, bufferLength_ - start);
}

// Implement FindSubstring method
const char* HttpParser::FindSubstring(
    const char* haystack, size_t haystackLen,
    const char* needle, size_t needleLen
  ) {
  if (needleLen > haystackLen) return nullptr;
  if (needleLen == 0) return haystack;

  const char* end = haystack + haystackLen - needleLen + 1;
  for (const char* p = haystack; p < end; p++) {
    if (!memcmp(p, needle, needleLen)) {
      return p;
    }
  }

  return nullptr;
}

// URL decode helper
std::string HttpParser::UrlDecode(const std::string_view& input) {
  std::string result;
  result.reserve(input.length());

  for (size_t i = 0; i < input.length(); i++) {
    if (input[i] == '%' && i + 2 < input.length()) {
      // Get the hex value
      unsigned int value;
      if (sscanf(input.data() + i + 1, "%2x", &value) == 1) {
        result += static_cast<char>(value);
        i += 2;
      } else {
        result += input[i];
      }
    } else if (input[i] == '+') {
      result += ' ';
    } else {
      result += input[i];
    }
  }

  return result;
}

// Header name normalization with caching
std::string HttpParser::NormalizeHeaderName(const std::string& name) {
  auto it = headerNames_.find(name);
  if (it != headerNames_.end()) {
    return it->second;
  }

  std::string normalized;
  normalized.reserve(name.length());

  bool capitalize = true;
  for (char c : name) {
    if (capitalize && std::isalpha(c)) {
      normalized += std::toupper(c);
      capitalize = false;
    } else if (c == '-') {
      normalized += c;
      capitalize = true;
    } else {
      normalized += c;
    }
  }

  return normalized;
}

// Get header value by name
std::string_view HttpParser::GetHeaderValueView(const std::string& name) const {
  auto it = headers_.find(ToLowercase(name));
  if (it != headers_.end()) {
    return it->second;
  }
  return std::string_view();
}

// Fast string comparison optimized for common cases
bool HttpParser::FastStringEqual(std::string_view a, const char* b) {
  size_t bLen = strlen(b);
  if (a.length() != bLen) {
    return false;
  }

  // Use SIMD for longer strings
#ifdef __x86_64__
  if (a.length() >= 16) {
    return SIMDStringEqual(a.data(), b, a.length());
  }
#endif

  // Unrolled comparison for short strings
  switch (a.length()) {
    case 0: return true;
    case 1: return a[0] == b[0];
    case 2: return a[0] == b[0] && a[1] == b[1];
    case 3: return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
    case 4: return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3];
    default:
      return std::memcmp(a.data(), b, a.length()) == 0;
  }
}

#ifdef __x86_64__
bool HttpParser::SIMDStringEqual(const char* a, const char* b, size_t length) {
  size_t vectorCount = length / 16;

  for (size_t i = 0; i < vectorCount; ++i) {
    __m128i vecA = _mm_loadu_si128(reinterpret_cast<const __m128i*>(a + i * 16));
    __m128i vecB = _mm_loadu_si128(reinterpret_cast<const __m128i*>(b + i * 16));
    __m128i cmp = _mm_cmpeq_epi8(vecA, vecB);

    if (_mm_movemask_epi8(cmp) != 0xFFFF) {
      return false;
    }
  }

  // Handle remainder
  size_t remainder = length % 16;
  if (remainder > 0) {
    return std::memcmp(a + length - remainder, b + length - remainder, remainder) == 0;
  }

  simdOptimizedOperations_++;
  return true;
}
#endif

// Fast string to integer conversion
int64_t HttpParser::FastStringToInt(std::string_view str) {
  if (str.empty()) return 0;

  int64_t result = 0;
  size_t i = 0;
  bool negative = false;

  if (str[0] == '-') {
    negative = true;
    i = 1;
  }

  // Unrolled parsing for common cases
  for (; i < str.length() && i < 10; ++i) {
    char c = str[i];
    if (c < '0' || c > '9') break;
    result = result * 10 + (c - '0');
  }

  return negative ? -result : result;
}

// Method validation with optimized lookup
bool HttpParser::IsValidMethod(std::string_view method) {
  // Quick check for common methods
  switch (method.length()) {
    case 3:
      return method == "GET" || method == "PUT";
    case 4:
      return method == "POST" || method == "HEAD";
    case 5:
      return method == "PATCH" || method == "TRACE";
    case 6:
      return method == "DELETE";
    case 7:
      return method == "OPTIONS" || method == "CONNECT";
    default:
      return false;
  }
}

// Performance metrics getter
Napi::Value HttpParser::GetPerformanceMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  metrics.Set("parseCount", Napi::Number::New(env, parseCount_));
  metrics.Set("totalParseTime", Napi::Number::New(env, totalParseTime_));
  metrics.Set("headerParseTime", Napi::Number::New(env, headerParseTime_));
  metrics.Set("bodyParseTime", Napi::Number::New(env, bodyParseTime_));
  metrics.Set("simdOptimizedOperations", Napi::Number::New(env, simdOptimizedOperations_));

  if (parseCount_ > 0) {
    metrics.Set("avgParseTime", Napi::Number::New(env, totalParseTime_ / parseCount_));
    metrics.Set("avgHeaderParseTime", Napi::Number::New(env, headerParseTime_ / parseCount_));
  }

  return metrics;
}

// Reset performance metrics
Napi::Value HttpParser::ResetPerformanceMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  parseCount_ = 0;
  totalParseTime_ = 0;
  headerParseTime_ = 0;
  bodyParseTime_ = 0;
  simdOptimizedOperations_ = 0;

  return env.Undefined();
}
