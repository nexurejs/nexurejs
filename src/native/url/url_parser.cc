#include <napi.h>
#include <string>
#include <unordered_map>
#include <string_view>
#include <cstring>
#include <memory>
#include <atomic>
#include <chrono>
#include "url_parser.h"

#ifdef __x86_64__
#include <immintrin.h>
#elif defined(__aarch64__)
#include <arm_neon.h>
#endif

/**
 * SIMD-Optimized URL Parser implementation
 * Provides ultra-fast URL parsing for Node.js with vectorized operations
 */
namespace UrlParser {

  // Performance metrics
  static std::atomic<uint64_t> totalParsed{0};
  static std::atomic<uint64_t> totalParseTime{0};
  static std::atomic<uint64_t> simdOperations{0};

  struct UrlParts {
    std::string_view protocol;
    std::string_view auth;
    std::string_view hostname;
    std::string_view port;
    std::string_view pathname;
    std::string_view search;
    std::string_view hash;

    // Convert to strings only when needed
    std::string protocolStr() const { return std::string(protocol); }
    std::string authStr() const { return std::string(auth); }
    std::string hostnameStr() const { return std::string(hostname); }
    std::string portStr() const { return std::string(port); }
    std::string pathnameStr() const { return std::string(pathname); }
    std::string searchStr() const { return std::string(search); }
    std::string hashStr() const { return std::string(hash); }
  };

  // SIMD-optimized character search functions
  namespace SIMDSearch {
    // Find character using SIMD
    size_t findChar(const char* str, size_t length, char target) {
#ifdef __aarch64__
      if (length >= 16) {
        uint8x16_t targetVec = vdupq_n_u8(target);
        size_t i = 0;

        for (; i <= length - 16; i += 16) {
          uint8x16_t chunk = vld1q_u8(reinterpret_cast<const uint8_t*>(str + i));
          uint8x16_t result = vceqq_u8(chunk, targetVec);

          // Check if any byte matches
          uint64x2_t result64 = vreinterpretq_u64_u8(result);
          uint64_t mask = vgetq_lane_u64(result64, 0) | vgetq_lane_u64(result64, 1);

          if (mask != 0) {
            simdOperations++;
            // Find first match in the 16-byte chunk
            for (size_t j = 0; j < 16; j++) {
              if (str[i + j] == target) return i + j;
            }
          }
        }

        // Handle remaining bytes
        for (; i < length; i++) {
          if (str[i] == target) return i;
        }
        return length;
      }
#endif

      // Fallback for short strings or unsupported platforms
      for (size_t i = 0; i < length; i++) {
        if (str[i] == target) return i;
      }
      return length;
    }

    // Find any of multiple characters using SIMD
    size_t findAnyChar(const char* str, size_t length, const char* targets, size_t targetCount) {
#ifdef __aarch64__
      if (length >= 16 && targetCount <= 4) {
        uint8x16_t targetVecs[4];
        for (size_t t = 0; t < targetCount; t++) {
          targetVecs[t] = vdupq_n_u8(targets[t]);
        }

        size_t i = 0;
        for (; i <= length - 16; i += 16) {
          uint8x16_t chunk = vld1q_u8(reinterpret_cast<const uint8_t*>(str + i));
          uint8x16_t combinedResult = vdupq_n_u8(0);

          for (size_t t = 0; t < targetCount; t++) {
            uint8x16_t result = vceqq_u8(chunk, targetVecs[t]);
            combinedResult = vorrq_u8(combinedResult, result);
          }

          uint64x2_t result64 = vreinterpretq_u64_u8(combinedResult);
          uint64_t mask = vgetq_lane_u64(result64, 0) | vgetq_lane_u64(result64, 1);

          if (mask != 0) {
            simdOperations++;
            // Find first match in the 16-byte chunk
            for (size_t j = 0; j < 16; j++) {
              for (size_t t = 0; t < targetCount; t++) {
                if (str[i + j] == targets[t]) return i + j;
              }
            }
          }
        }

        // Handle remaining bytes
        for (; i < length; i++) {
          for (size_t t = 0; t < targetCount; t++) {
            if (str[i] == targets[t]) return i;
          }
        }
        return length;
      }
#endif

      // Fallback implementation
      for (size_t i = 0; i < length; i++) {
        for (size_t t = 0; t < targetCount; t++) {
          if (str[i] == targets[t]) return i;
        }
      }
      return length;
    }
  }

  // Zero-copy URL parsing with SIMD optimizations
  UrlParts parseUrl(const char* url, size_t length) {
    auto start = std::chrono::high_resolution_clock::now();

    UrlParts parts{};

    // Fast path for empty URL
    if (length == 0) {
      return parts;
    }

    size_t pos = 0;
    const char* urlStart = url;

    // Parse protocol using SIMD search for "://"
    size_t colonPos = SIMDSearch::findChar(url, length > 2 ? length - 2 : 0, ':');
    if (colonPos < length - 2 && url[colonPos + 1] == '/' && url[colonPos + 2] == '/') {
      parts.protocol = std::string_view(urlStart, colonPos);
      pos = colonPos + 3; // Skip "://"
    }

    // Check if we have authority part (//...)
    bool hasAuthority = false;
    if (pos == 0 && length >= 2 && url[0] == '/' && url[1] == '/') {
      hasAuthority = true;
      pos = 2; // Skip "//"
    }

    if (hasAuthority || !parts.protocol.empty()) {
      // Find end of authority using SIMD search for multiple characters
      const char pathChars[] = {'/', '?', '#'};
      size_t authorityEnd = SIMDSearch::findAnyChar(url + pos, length - pos, pathChars, 3);
      if (authorityEnd == length - pos) {
        authorityEnd = length;
      } else {
        authorityEnd += pos;
      }

      // Extract authority
      std::string_view authority(url + pos, authorityEnd - pos);

      // Parse auth (username:password@) using SIMD
      size_t authEnd = SIMDSearch::findChar(authority.data(), authority.length(), '@');
      if (authEnd < authority.length()) {
        parts.auth = authority.substr(0, authEnd);
        authority = authority.substr(authEnd + 1);
      }

      // Parse hostname and port using SIMD
      size_t portStart = SIMDSearch::findChar(authority.data(), authority.length(), ':');
      if (portStart < authority.length()) {
        parts.hostname = authority.substr(0, portStart);
        parts.port = authority.substr(portStart + 1);
      } else {
        parts.hostname = authority;
      }

      pos = authorityEnd;
    }

    // Parse pathname using SIMD search
    const char queryHashChars[] = {'?', '#'};
    size_t pathnameEnd = SIMDSearch::findAnyChar(url + pos, length - pos, queryHashChars, 2);
    if (pathnameEnd == length - pos) {
      pathnameEnd = length;
    } else {
      pathnameEnd += pos;
    }

    parts.pathname = std::string_view(url + pos, pathnameEnd - pos);
    pos = pathnameEnd;

    // Parse search using SIMD
    if (pos < length && url[pos] == '?') {
      size_t searchEnd = SIMDSearch::findChar(url + pos + 1, length - pos - 1, '#');
      if (searchEnd == length - pos - 1) {
        searchEnd = length;
      } else {
        searchEnd += pos + 1;
      }
      parts.search = std::string_view(url + pos + 1, searchEnd - pos - 1);
      pos = searchEnd;
    }

    // Parse hash
    if (pos < length && url[pos] == '#') {
      parts.hash = std::string_view(url + pos + 1, length - pos - 1);
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
    totalParseTime += duration;
    totalParsed++;

    return parts;
  }

  // SIMD-optimized query string parsing
  std::unordered_map<std::string, std::string> parseQueryString(const char* queryString, size_t length) {
    std::unordered_map<std::string, std::string> queryParams;
    queryParams.reserve(16); // Pre-allocate for better performance

    // Fast path for empty query string
    if (length == 0) {
      return queryParams;
    }

    size_t start = 0;

    while (start < length) {
      // Find next '&' using SIMD
      size_t ampPos = SIMDSearch::findChar(queryString + start, length - start, '&');
      size_t end = (ampPos == length - start) ? length : start + ampPos;

      if (end > start) {
        // Find the equals sign using SIMD
        size_t paramLength = end - start;
        size_t equalsPos = SIMDSearch::findChar(queryString + start, paramLength, '=');

        if (equalsPos < paramLength) {
          // We have a key-value pair
          std::string key(queryString + start, equalsPos);
          std::string value(queryString + start + equalsPos + 1, paramLength - equalsPos - 1);
          queryParams[std::move(key)] = std::move(value);
        } else {
          // We have a key with no value
          std::string key(queryString + start, paramLength);
          queryParams[std::move(key)] = "";
        }
      }

      start = end + 1;
    }

    return queryParams;
  }

  Napi::Value Parse(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || (!info[0].IsString() && !info[0].IsBuffer())) {
      Napi::TypeError::New(env, "String or Buffer expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    const char* url;
    size_t length;
    std::string urlStr;

    // Zero-copy for buffers, minimal copy for strings
    if (info[0].IsBuffer()) {
      Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
      url = buffer.Data();
      length = buffer.Length();
    } else {
      urlStr = info[0].As<Napi::String>().Utf8Value();
      url = urlStr.c_str();
      length = urlStr.length();
    }

    UrlParts parts = parseUrl(url, length);

    Napi::Object result = Napi::Object::New(env);
    result.Set("protocol", Napi::String::New(env, parts.protocolStr()));
    result.Set("auth", Napi::String::New(env, parts.authStr()));
    result.Set("hostname", Napi::String::New(env, parts.hostnameStr()));
    result.Set("port", Napi::String::New(env, parts.portStr()));
    result.Set("pathname", Napi::String::New(env, parts.pathnameStr()));
    result.Set("search", Napi::String::New(env, parts.searchStr()));
    result.Set("hash", Napi::String::New(env, parts.hashStr()));

    return result;
  }

  Napi::Value ParseQueryString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || (!info[0].IsString() && !info[0].IsBuffer())) {
      Napi::TypeError::New(env, "String or Buffer expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    const char* queryString;
    size_t length;
    std::string queryStr;

    // Zero-copy for buffers
    if (info[0].IsBuffer()) {
      Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
      queryString = buffer.Data();
      length = buffer.Length();
    } else {
      queryStr = info[0].As<Napi::String>().Utf8Value();
      queryString = queryStr.c_str();
      length = queryStr.length();
    }

    auto queryParams = parseQueryString(queryString, length);

    Napi::Object result = Napi::Object::New(env);
    for (const auto& pair : queryParams) {
      result.Set(pair.first, Napi::String::New(env, pair.second));
    }

    return result;
  }

  // Optimized URL formatting with pre-allocated buffers
  Napi::Value Format(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
      Napi::TypeError::New(env, "Object expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Object urlObj = info[0].As<Napi::Object>();

    // Pre-allocate with intelligent size estimation
    std::string result;
    result.reserve(512); // Larger initial allocation for better performance

    // Add protocol if present
    if (urlObj.HasOwnProperty("protocol") && urlObj.Get("protocol").IsString()) {
      std::string protocol = urlObj.Get("protocol").As<Napi::String>().Utf8Value();
      if (!protocol.empty()) {
        result += protocol;
        if (protocol.back() != ':') {
          result += ':';
        }
        if (protocol.length() < 2 || protocol.substr(protocol.length() - 2) != "//") {
          result += "//";
        }
      }
    }

    // Add auth if present
    if (urlObj.HasOwnProperty("auth") && urlObj.Get("auth").IsString()) {
      std::string auth = urlObj.Get("auth").As<Napi::String>().Utf8Value();
      if (!auth.empty()) {
        result += auth;
        result += '@';
      }
    }

    // Add hostname if present
    if (urlObj.HasOwnProperty("hostname") && urlObj.Get("hostname").IsString()) {
      result += urlObj.Get("hostname").As<Napi::String>().Utf8Value();
    }

    // Add port if present
    if (urlObj.HasOwnProperty("port") && urlObj.Get("port").IsString()) {
      std::string port = urlObj.Get("port").As<Napi::String>().Utf8Value();
      if (!port.empty()) {
        result += ':';
        result += port;
      }
    }

    // Add pathname if present
    if (urlObj.HasOwnProperty("pathname") && urlObj.Get("pathname").IsString()) {
      std::string pathname = urlObj.Get("pathname").As<Napi::String>().Utf8Value();
      if (!pathname.empty() && pathname[0] != '/') {
        result += '/';
      }
      result += pathname;
    }

    // Add search if present
    if (urlObj.HasOwnProperty("search") && urlObj.Get("search").IsString()) {
      std::string search = urlObj.Get("search").As<Napi::String>().Utf8Value();
      if (!search.empty()) {
        if (search[0] != '?') {
          result += '?';
        }
        result += search;
      }
    }

    // Add hash if present
    if (urlObj.HasOwnProperty("hash") && urlObj.Get("hash").IsString()) {
      std::string hash = urlObj.Get("hash").As<Napi::String>().Utf8Value();
      if (!hash.empty()) {
        if (hash[0] != '#') {
          result += '#';
        }
        result += hash;
      }
    }

    return Napi::String::New(env, result);
  }

  // Optimized query string formatting
  Napi::Value FormatQueryString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
      Napi::TypeError::New(env, "Object expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Object queryObj = info[0].As<Napi::Object>();
    Napi::Array keys = queryObj.GetPropertyNames();

    // Pre-allocate with intelligent size estimation
    std::string result;
    result.reserve(keys.Length() * 32); // Estimate 32 chars per parameter

    for (uint32_t i = 0; i < keys.Length(); i++) {
      Napi::Value key = keys.Get(i);
      Napi::Value value = queryObj.Get(key);

      if (i > 0) {
        result += '&';
      }

      result += key.As<Napi::String>().Utf8Value();
      result += '=';

      if (value.IsString()) {
        result += value.As<Napi::String>().Utf8Value();
      } else if (!value.IsNull() && !value.IsUndefined()) {
        // Convert non-string values to string
        Napi::String strValue = value.ToString();
        result += strValue.Utf8Value();
      }
    }

    return Napi::String::New(env, result);
  }

  // Performance metrics
  Napi::Value GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object metrics = Napi::Object::New(env);

    uint64_t parsed = totalParsed.load();
    uint64_t parseTime = totalParseTime.load();
    uint64_t simdOps = simdOperations.load();

    metrics.Set("totalParsed", Napi::Number::New(env, parsed));
    metrics.Set("totalParseTime", Napi::Number::New(env, parseTime));
    metrics.Set("simdOperations", Napi::Number::New(env, simdOps));

    if (parsed > 0) {
      double avgParseTime = static_cast<double>(parseTime) / parsed;
      double urlsPerSecond = 1000000000.0 / avgParseTime; // nanoseconds to per second
      double simdEfficiency = static_cast<double>(simdOps) / parsed;

      metrics.Set("averageParseTime", Napi::Number::New(env, avgParseTime));
      metrics.Set("urlsPerSecond", Napi::Number::New(env, urlsPerSecond));
      metrics.Set("simdEfficiency", Napi::Number::New(env, simdEfficiency));
    }

    return metrics;
  }

  // Reset performance metrics
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info) {
    totalParsed = 0;
    totalParseTime = 0;
    simdOperations = 0;
    return info.Env().Undefined();
  }

  Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("parse", Napi::Function::New(env, Parse));
    exports.Set("parseQueryString", Napi::Function::New(env, ParseQueryString));
    exports.Set("format", Napi::Function::New(env, Format));
    exports.Set("formatQueryString", Napi::Function::New(env, FormatQueryString));
    exports.Set("getMetrics", Napi::Function::New(env, GetMetrics));
    exports.Set("resetMetrics", Napi::Function::New(env, ResetMetrics));
    return exports;
  }

} // namespace UrlParser
