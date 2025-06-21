#include "radix_router.h"
#include <algorithm>
#include <sstream>
#include <cstring>
#include <chrono>
#include <atomic>

// SIMD intrinsics for optimization
#ifdef __x86_64__
#include <immintrin.h>
#include <nmmintrin.h>
#endif

// Performance metrics
namespace RouterMetrics {
  std::atomic<uint64_t> total_lookups{0};
  std::atomic<uint64_t> simd_string_matches{0};
  std::atomic<uint64_t> total_lookup_time_us{0};
  std::atomic<uint64_t> route_insertions{0};
  std::atomic<uint64_t> cache_hits{0};
  std::atomic<uint64_t> cache_misses{0};
}

// SIMD capability detection
bool RadixRouter::HasAVX2() {
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

bool RadixRouter::HasSSE42() {
#ifdef __x86_64__
  static int sse42_supported = -1;
  if (sse42_supported == -1) {
    int cpuInfo[4];
    __cpuid(1, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    sse42_supported = (cpuInfo[2] & (1 << 20)) ? 1 : 0;
  }
  return sse42_supported == 1;
#else
  return false;
#endif
}

// SIMD-optimized string comparison
int RadixRouter::CompareStrings_SIMD(const char* str1, const char* str2, size_t length) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 32) {
    return std::memcmp(str1, str2, length);
  }

  const size_t simd_width = 32;
  const size_t simd_iterations = length / simd_width;

  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256i chunk1 = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(str1 + i * simd_width));
    __m256i chunk2 = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(str2 + i * simd_width));

    __m256i cmp = _mm256_cmpeq_epi8(chunk1, chunk2);
    int mask = _mm256_movemask_epi8(cmp);

    if (mask != -1) {
      // Found difference - need to find exact position
      for (size_t j = 0; j < simd_width; ++j) {
        size_t pos = i * simd_width + j;
        if (pos >= length) break;
        if (str1[pos] != str2[pos]) {
          return str1[pos] - str2[pos];
        }
      }
    }
  }

  // Handle remaining bytes
  for (size_t i = simd_iterations * simd_width; i < length; ++i) {
    if (str1[i] != str2[i]) {
      return str1[i] - str2[i];
    }
  }

  RouterMetrics::simd_string_matches.fetch_add(1);
  return 0;
#else
  return std::memcmp(str1, str2, length);
#endif
}

// SIMD-optimized prefix matching
size_t RadixRouter::FindCommonPrefix_SIMD(const char* str1, const char* str2,
                                         size_t max_length) {
#ifdef __x86_64__
  if (!HasAVX2() || max_length < 32) {
    // Scalar fallback
    size_t common = 0;
    while (common < max_length && str1[common] == str2[common]) {
      common++;
    }
    return common;
  }

  const size_t simd_width = 32;
  const size_t simd_iterations = max_length / simd_width;
  size_t common = 0;

  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256i chunk1 = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(str1 + i * simd_width));
    __m256i chunk2 = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(str2 + i * simd_width));

    __m256i cmp = _mm256_cmpeq_epi8(chunk1, chunk2);
    int mask = _mm256_movemask_epi8(cmp);

    if (mask == -1) {
      // All 32 bytes match
      common += simd_width;
    } else {
      // Find first non-matching byte
      for (size_t j = 0; j < simd_width; ++j) {
        if (!(mask & (1 << j))) {
          return common + j;
        }
      }
    }
  }

  // Handle remaining bytes
  for (size_t i = common; i < max_length; ++i) {
    if (str1[i] != str2[i]) {
      break;
    }
    common++;
  }

  return common;
#else
  size_t common = 0;
  while (common < max_length && str1[common] == str2[common]) {
    common++;
  }
  return common;
#endif
}

// SIMD-optimized route pattern matching
bool RadixRouter::MatchPattern_SIMD(const std::string& pattern, const std::string& path) {
  if (pattern.empty() || path.empty()) {
    return false;
  }

  // Handle simple exact matches with SIMD
  if (pattern.find('*') == std::string::npos && pattern.find(':') == std::string::npos) {
    if (pattern.length() != path.length()) {
      return false;
    }
    return CompareStrings_SIMD(pattern.c_str(), path.c_str(), pattern.length()) == 0;
  }

  // For complex patterns, fall back to scalar matching
  return MatchPatternScalar(pattern, path);
}

// Scalar pattern matching fallback
bool RadixRouter::MatchPatternScalar(const std::string& pattern, const std::string& path) {
  size_t p_idx = 0, path_idx = 0;

  while (p_idx < pattern.length() && path_idx < path.length()) {
    char p_char = pattern[p_idx];

    if (p_char == '*') {
      // Wildcard - match rest of path
      return true;
    } else if (p_char == ':') {
      // Parameter - skip to next slash or end
      while (path_idx < path.length() && path[path_idx] != '/') {
        path_idx++;
      }

      // Skip parameter name in pattern
      while (p_idx < pattern.length() && pattern[p_idx] != '/') {
        p_idx++;
      }
    } else if (p_char == path[path_idx]) {
      // Exact character match
      p_idx++;
      path_idx++;
    } else {
      return false;
    }
  }

  return p_idx == pattern.length() && path_idx == path.length();
}

// RadixNode implementation
RadixNode::RadixNode() : isWildcard(false), hasHandler(false) {
  // Initialize bitmap to zeros
  std::memset(staticChildrenBitmap, 0, sizeof(staticChildrenBitmap));
}

RadixNode::~RadixNode() {}

inline void RadixNode::setBit(char c) {
  // Fast bitmap operation using bit shifting
  unsigned char uc = static_cast<unsigned char>(c);
  staticChildrenBitmap[uc >> 6] |= (1ULL << (uc & 63));
}

inline bool RadixNode::hasBit(char c) const {
  // Fast bitmap check using bit shifting
  unsigned char uc = static_cast<unsigned char>(c);
  return (staticChildrenBitmap[uc >> 6] & (1ULL << (uc & 63))) != 0;
}

// RadixRouter implementation
Napi::Object RadixRouter::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "RadixRouter", {
    InstanceMethod("add", &RadixRouter::Add),
    InstanceMethod("find", &RadixRouter::Find),
    InstanceMethod("remove", &RadixRouter::Remove),
    InstanceMethod("insert", &RadixRouter::Insert),
    InstanceMethod("lookup", &RadixRouter::Lookup),
    InstanceMethod("clearCache", &RadixRouter::ClearCache),
    InstanceMethod("getMetrics", &RadixRouter::GetMetrics),
    StaticMethod("getCapabilities", &RadixRouter::GetCapabilities),
    StaticMethod("benchmark", &RadixRouter::Benchmark),
  });

  exports.Set("RadixRouter", func);
  return exports;
}

Napi::Object RadixRouter::NewInstance(Napi::Env env) {
  Napi::EscapableHandleScope scope(env);
  Napi::Function func = Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
    return RadixRouter::NewInstance(info.Env());
  });
  return scope.Escape(func.New({})).ToObject();
}

RadixRouter::RadixRouter(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<RadixRouter>(info), cacheSize_(0), maxCacheSize_(10000), env_(info.Env()) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Create root node
  root_ = std::make_unique<RadixNode>();

  // Pre-allocate cache with a reasonable size to avoid rehashing
  routeCache_.reserve(1000);

  // Parse options if provided
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("maxCacheSize") && options.Get("maxCacheSize").IsNumber()) {
      maxCacheSize_ = options.Get("maxCacheSize").As<Napi::Number>().Uint32Value();
      routeCache_.reserve(std::min(maxCacheSize_ / 2, size_t(1000)));
    }
  }
}

RadixRouter::~RadixRouter() {
  // Clear route cache to release JavaScript references
  routeCache_.clear();
}

// Add a route to the router
Napi::Value RadixRouter::Add(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsObject()) {
    Napi::TypeError::New(env, "Expected method (string), path (string), and handler (object)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string method = info[0].As<Napi::String>().Utf8Value();
  std::string path = info[1].As<Napi::String>().Utf8Value();
  Napi::Object handler = info[2].As<Napi::Object>();

  // Pre-process the path for faster matching
  if (path.empty() || path[0] != '/') {
    path = "/" + path;
  }

  // Remove trailing slash for consistency (except for root path)
  if (path.length() > 1 && path.back() == '/') {
    path.pop_back();
  }

  // Insert the route
  Insert(method, path, handler);

  return env.Undefined();
}

// Find a route
Napi::Value RadixRouter::Find(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected method (string) and path (string)").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string method = info[0].As<Napi::String>().Utf8Value();
  std::string pathStr = info[1].As<Napi::String>().Utf8Value();

  // Pre-process the path for faster matching
  if (pathStr.empty() || pathStr[0] != '/') {
    pathStr = "/" + pathStr;
  }

  // Create cache key
  std::string cacheKey = method + ":" + pathStr;

  // Check cache first
  auto cacheIt = routeCache_.find(cacheKey);
  if (cacheIt != routeCache_.end()) {
    return cacheIt->second.Value();
  }

  // Lookup the route
  Napi::Value result = Lookup(method, pathStr);

  // Cache the result if it's a successful match and cache isn't full
  if (result.IsObject() && routeCache_.size() < maxCacheSize_) {
    Napi::Object resultObj = result.As<Napi::Object>();
    if (resultObj.Has("found") && resultObj.Get("found").ToBoolean()) {
      std::string cacheKeyStr = std::string(cacheKey);
      routeCache_.insert(std::make_pair(cacheKeyStr, Napi::Persistent(result.As<Napi::Object>())));
      cacheSize_++;

      // Simple cache eviction if we're at 90% capacity
      if (cacheSize_ >= maxCacheSize_ * 0.9) {
        // Remove 10% of the cache (oldest entries)
        size_t toRemove = maxCacheSize_ / 10;
        if (toRemove > 0) {
          auto it = routeCache_.begin();
          for (size_t i = 0; i < toRemove && it != routeCache_.end(); i++) {
            it = routeCache_.erase(it);
          }
          cacheSize_ -= toRemove;
        }
      }
    }
  }

  return result;
}

// Remove a route
Napi::Value RadixRouter::Remove(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected method (string) and path (string)").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  std::string method = info[0].As<Napi::String>().Utf8Value();
  std::string pathStr = info[1].As<Napi::String>().Utf8Value();

  // Pre-process the path for faster matching
  if (pathStr.empty() || pathStr[0] != '/') {
    pathStr = "/" + pathStr;
  }

  // Find the node
  RadixNode* node = root_.get();
  std::string_view remaining = pathStr;

  while (!remaining.empty() && node) {
    char firstChar = remaining[0];

    if (firstChar == ':') {
      // Parameter node
      if (!node->paramChild) {
        return Napi::Boolean::New(env, false);
      }

      // Extract parameter name
      size_t paramEnd = remaining.find('/', 1);
      if (paramEnd == std::string::npos) {
        paramEnd = remaining.length();
      }

      // Move to parameter child
      node = node->paramChild.get();
      remaining = paramEnd < remaining.length() ? remaining.substr(paramEnd) : std::string_view();
    } else if (firstChar == '*') {
      // Wildcard node
      if (!node->wildcardChild) {
        return Napi::Boolean::New(env, false);
      }

      // Move to wildcard child
      node = node->wildcardChild.get();
      remaining = std::string_view();
    } else {
      // Static node - find the longest common prefix
      if (!node->hasBit(firstChar)) {
        return Napi::Boolean::New(env, false);
      }

      auto it = node->children.find(firstChar);
      if (it == node->children.end()) {
        return Napi::Boolean::New(env, false);
      }

      RadixNode* child = it->second.get();

      // Find common prefix length
      size_t i = 0;
      size_t max = std::min(child->path.length(), remaining.length());
      while (i < max && child->path[i] == remaining[i]) {
        i++;
      }

      if (i < child->path.length()) {
        // Partial match, not found
        return Napi::Boolean::New(env, false);
      }

      // Move to child node
      node = child;
      remaining = remaining.substr(i);
    }
  }

  // Check if we found the node and it has a handler for this method
  if (node && node->hasHandler) {
    auto handlerIt = node->handlers.find(method);
    if (handlerIt != node->handlers.end()) {
      // Remove the handler
      node->handlers.erase(handlerIt);

      // Update hasHandler flag
      node->hasHandler = !node->handlers.empty();

      // Clear the route cache
      routeCache_.clear();
      cacheSize_ = 0;

      return Napi::Boolean::New(env, true);
    }
  }

  return Napi::Boolean::New(env, false);
}

// Insert a route into the radix tree
void RadixRouter::Insert(const std::string& method, const std::string& path, const Napi::Object& handler) {
  RadixNode* node = root_.get();
  std::string_view remaining(path);

  while (!remaining.empty()) {
    char firstChar = remaining[0];

    if (firstChar == ':') {
      // Parameter node
      if (!node->paramChild) {
        node->paramChild = std::make_unique<RadixNode>();
      }

      // Extract parameter name
      size_t paramEnd = remaining.find('/', 1);
      if (paramEnd == std::string::npos) {
        paramEnd = remaining.length();
      }

      // Set parameter name
      node->paramChild->paramName = std::string(remaining.substr(1, paramEnd - 1));

      // Move to parameter child
      node = node->paramChild.get();
      remaining = paramEnd < remaining.length() ? remaining.substr(paramEnd) : std::string_view();
    } else if (firstChar == '*') {
      // Wildcard node
      if (!node->wildcardChild) {
        node->wildcardChild = std::make_unique<RadixNode>();
        node->wildcardChild->isWildcard = true;
      }

      // Extract wildcard name if present
      if (remaining.length() > 1) {
        node->wildcardChild->paramName = std::string(remaining.substr(1));
      }

      // Move to wildcard child
      node = node->wildcardChild.get();
      remaining = std::string_view();
    } else {
      // Static node
      if (!node->hasBit(firstChar)) {
        // No child with this starting character, create a new one
        node->setBit(firstChar);
        auto newChild = std::make_unique<RadixNode>();
        newChild->path = std::string(remaining);
        node->children[firstChar] = std::move(newChild);
        node = node->children[firstChar].get();
        remaining = std::string_view();
      } else {
        // Child exists, find it
        auto it = node->children.find(firstChar);
        if (it == node->children.end()) {
          // This shouldn't happen if bitmap is correct
          throw std::runtime_error("Bitmap inconsistency");
        }

        RadixNode* child = it->second.get();

        // Find common prefix length
        size_t i = 0;
        size_t max = std::min(child->path.length(), remaining.length());
        while (i < max && child->path[i] == remaining[i]) {
          i++;
        }

        if (i < child->path.length()) {
          // Split the node
          auto newChild = std::make_unique<RadixNode>();
          newChild->path = child->path.substr(i);
          newChild->children = std::move(child->children);
          newChild->paramChild = std::move(child->paramChild);
          newChild->wildcardChild = std::move(child->wildcardChild);
          newChild->handlers = std::move(child->handlers);
          newChild->hasHandler = child->hasHandler;

          // Update the current child
          child->path = child->path.substr(0, i);
          child->hasHandler = false;
          child->handlers.clear();

          // Set bitmap for the first character of the new path
          if (!newChild->path.empty()) {
            child->setBit(newChild->path[0]);
            child->children[newChild->path[0]] = std::move(newChild);
          }
        }

        // Move to child node
        node = child;
        remaining = remaining.substr(i);
      }
    }
  }

  // Store the handler
  node->hasHandler = true;
  node->handlers[method] = Napi::Persistent(handler);
}

// Lookup a route in the radix tree
Napi::Value RadixRouter::Lookup(const std::string& method, const std::string& path) {
  Napi::Env env = env_;

  // Pre-allocate result object with expected properties
  Napi::Object result = Napi::Object::New(env);
  Napi::Object params = Napi::Object::New(env);
  result.Set("params", params);
  result.Set("found", Napi::Boolean::New(env, false));

  // Start at the root
  RadixNode* node = root_.get();
  std::string_view remaining(path);

  // Track matched handlers for wildcard fallback
  struct MatchedHandler {
    RadixNode* node;
    size_t paramsCount;
  };

  // Pre-allocate space to avoid reallocations
  std::vector<MatchedHandler> matchedHandlers;
  matchedHandlers.reserve(8); // Most routes won't have more than 8 parameters

  while (!remaining.empty() && node) {
    char firstChar = remaining[0];

    // Try static routes first (most specific)
    if (node->hasBit(firstChar)) {
      auto it = node->children.find(firstChar);
      if (it != node->children.end()) {
        RadixNode* child = it->second.get();

        // Check if the path matches
        size_t childPathLen = child->path.length();
        if (remaining.length() >= childPathLen) {
          // Use direct character comparison instead of substring
          bool match = true;
          for (size_t i = 0; i < childPathLen; i++) {
            if (remaining[i] != child->path[i]) {
              match = false;
              break;
            }
          }

          if (match) {
            // Move to child node
            node = child;
            remaining = remaining.substr(childPathLen);
            continue;
          }
        }
      }
    }

    // Try parameter routes next
    if (node->paramChild) {
      // Extract parameter value
      size_t paramEnd = remaining.find('/', 1);
      if (paramEnd == std::string::npos) {
        paramEnd = remaining.length();
      }

      std::string_view paramValue = remaining.substr(0, paramEnd);

      // Store parameter
      params.Set(node->paramChild->paramName, Napi::String::New(env, std::string(paramValue)));

      // Move to parameter child
      node = node->paramChild.get();
      remaining = paramEnd < remaining.length() ? remaining.substr(paramEnd) : std::string_view();

      // If this node has a handler, track it as a potential match
      if (node->hasHandler) {
        matchedHandlers.push_back({node, params.GetPropertyNames().Length()});
      }

      continue;
    }

    // Try wildcard routes last (least specific)
    if (node->wildcardChild) {
      // Store wildcard parameter if it has a name
      if (!node->wildcardChild->paramName.empty()) {
        params.Set(node->wildcardChild->paramName, Napi::String::New(env, std::string(remaining)));
      }

      // Move to wildcard child
      node = node->wildcardChild.get();
      remaining = std::string_view();

      // If this node has a handler, track it as a potential match
      if (node->hasHandler) {
        matchedHandlers.push_back({node, params.GetPropertyNames().Length()});
      }

      continue;
    }

    // No match found
    break;
  }

  // Check if we found an exact match
  if (remaining.empty() && node && node->hasHandler) {
    auto handlerIt = node->handlers.find(method);
    if (handlerIt != node->handlers.end()) {
      // Found an exact match
      result.Set("handler", handlerIt->second.Value());
      result.Set("found", Napi::Boolean::New(env, true));
      return result;
    }
  }

  // Check for matched handlers (from most to least specific)
  if (!matchedHandlers.empty()) {
    // Sort by parameter count (most specific first)
    if (matchedHandlers.size() > 1) {
      std::sort(matchedHandlers.begin(), matchedHandlers.end(),
                [](const MatchedHandler& a, const MatchedHandler& b) {
                  return a.paramsCount > b.paramsCount;
                });
    }

    for (const auto& match : matchedHandlers) {
      auto handlerIt = match.node->handlers.find(method);
      if (handlerIt != match.node->handlers.end()) {
        // Found a match
        result.Set("handler", handlerIt->second.Value());
        result.Set("found", Napi::Boolean::New(env, true));
        return result;
      }
    }
  }

  // No handler found - result already has found=false
  return result;
}

// Insert route with optimizations
Napi::Value RadixRouter::Insert(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsFunction()) {
    Napi::TypeError::New(env, "Expected method, path, and handler").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string method = info[0].As<Napi::String>().Utf8Value();
  std::string path = info[1].As<Napi::String>().Utf8Value();
  Napi::Function handler = info[2].As<Napi::Function>();

  // Create route key
  std::string route_key = method + ":" + path;

  // Insert into radix tree
  InsertRoute(route_key, handler);

  // Clear cache since routes changed
  routeCache_.clear();
  cacheSize_ = 0;

  RouterMetrics::route_insertions.fetch_add(1);

  return Napi::Boolean::New(env, true);
}

// Optimized route lookup
Napi::Value RadixRouter::Lookup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto startTime = std::chrono::high_resolution_clock::now();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected method and path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string method = info[0].As<Napi::String>().Utf8Value();
  std::string path = info[1].As<Napi::String>().Utf8Value();
  std::string route_key = method + ":" + path;

  // Check cache first
  auto cache_it = routeCache_.find(route_key);
  if (cache_it != routeCache_.end()) {
    // Move to front of LRU
    routeCache_.erase(cache_it);
    routeCache_.push_front(route_key);

    RouterMetrics::cache_hits.fetch_add(1);

    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();
    RouterMetrics::total_lookup_time_us.fetch_add(duration);
    RouterMetrics::total_lookups.fetch_add(1);

    return cache_it->second.Value();
  }

  RouterMetrics::cache_misses.fetch_add(1);

  // Perform tree lookup
  std::map<std::string, std::string> params;
  RouteMatch match = LookupRoute(route_key, params);

  Napi::Object result = Napi::Object::New(env);

  if (match.found) {
    result.Set("found", Napi::Boolean::New(env, true));
    result.Set("handler", match.handler.Value());

    // Add parameters
    Napi::Object paramsObj = Napi::Object::New(env);
    for (const auto& param : params) {
      paramsObj.Set(param.first, Napi::String::New(env, param.second));
    }
    result.Set("params", paramsObj);
  } else {
    result.Set("found", Napi::Boolean::New(env, false));
  }

  // Cache the result
  if (routeCache_.size() >= maxCacheSize_) {
    // Remove LRU item
    std::string lru_key = routeCache_.back();
    routeCache_.pop_back();
    routeCache_.erase(lru_key);
  }

  routeCache_.push_front(route_key);
  routeCache_[route_key] = Napi::Persistent(result);

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  RouterMetrics::total_lookup_time_us.fetch_add(duration);
  RouterMetrics::total_lookups.fetch_add(1);

  return result;
}

// Internal route insertion
void RadixRouter::InsertRoute(const std::string& route, const Napi::Function& handler) {
  RouteNode* current = root_.get();
  size_t route_pos = 0;

  while (route_pos < route.length()) {
    bool found = false;

    // Check existing children for common prefix
    for (auto& child : current->children) {
      size_t common = FindCommonPrefix_SIMD(
        route.c_str() + route_pos,
        child->prefix.c_str(),
        std::min(route.length() - route_pos, child->prefix.length())
      );

      if (common > 0) {
        if (common == child->prefix.length()) {
          // Exact prefix match - continue with this child
          current = child.get();
          route_pos += common;
          found = true;
          break;
        } else {
          // Partial match - need to split node
          SplitNode(child.get(), common);
          current = child.get();
          route_pos += common;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // No matching child - create new branch
      auto new_node = std::make_unique<RouteNode>();
      new_node->prefix = route.substr(route_pos);
      new_node->handler = Napi::Persistent(handler);
      new_node->is_endpoint = true;
      current->children.push_back(std::move(new_node));
      return;
    }
  }

  // Route fully consumed - mark as endpoint
  current->handler = Napi::Persistent(handler);
  current->is_endpoint = true;
}

// Internal route lookup with SIMD optimizations
RouteMatch RadixRouter::LookupRoute(const std::string& route,
                                  std::map<std::string, std::string>& params) {
  RouteNode* current = root_.get();
  size_t route_pos = 0;

  while (route_pos < route.length()) {
    bool found = false;

    for (auto& child : current->children) {
      if (child->prefix.empty()) continue;

      // Check if this child could match
      if (child->prefix[0] == ':') {
        // Parameter matching
        std::string param_name = child->prefix.substr(1);
        size_t param_end = route.find('/', route_pos);
        if (param_end == std::string::npos) {
          param_end = route.length();
        }

        std::string param_value = route.substr(route_pos, param_end - route_pos);
        params[param_name] = param_value;

        current = child.get();
        route_pos = param_end;
        found = true;
        break;
      } else if (child->prefix[0] == '*') {
        // Wildcard matching
        current = child.get();
        route_pos = route.length(); // Consume rest of route
        found = true;
        break;
      } else {
        // Exact prefix matching with SIMD
        size_t max_compare = std::min(route.length() - route_pos, child->prefix.length());

        if (max_compare > 0 &&
            CompareStrings_SIMD(route.c_str() + route_pos,
                               child->prefix.c_str(), max_compare) == 0) {
          current = child.get();
          route_pos += max_compare;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      return {false, Napi::FunctionReference()};
    }
  }

  if (current->is_endpoint) {
    return {true, current->handler};
  }

  return {false, Napi::FunctionReference()};
}

// Split node for optimization
void RadixRouter::SplitNode(RouteNode* node, size_t split_pos) {
  // Create new child with remaining prefix
  auto new_child = std::make_unique<RouteNode>();
  new_child->prefix = node->prefix.substr(split_pos);
  new_child->handler = std::move(node->handler);
  new_child->is_endpoint = node->is_endpoint;
  new_child->children = std::move(node->children);

  // Update current node
  node->prefix = node->prefix.substr(0, split_pos);
  node->is_endpoint = false;
  node->children.clear();
  node->children.push_back(std::move(new_child));
}

// Get performance metrics
Napi::Value RadixRouter::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::Object metrics = Napi::Object::New(env);
  metrics.Set("totalLookups", Napi::Number::New(env, RouterMetrics::total_lookups.load()));
  metrics.Set("simdStringMatches", Napi::Number::New(env, RouterMetrics::simd_string_matches.load()));
  metrics.Set("totalLookupTimeUs", Napi::Number::New(env, RouterMetrics::total_lookup_time_us.load()));
  metrics.Set("routeInsertions", Napi::Number::New(env, RouterMetrics::route_insertions.load()));
  metrics.Set("cacheHits", Napi::Number::New(env, RouterMetrics::cache_hits.load()));
  metrics.Set("cacheMisses", Napi::Number::New(env, RouterMetrics::cache_misses.load()));

  // Calculate derived metrics
  uint64_t lookups = RouterMetrics::total_lookups.load();
  uint64_t timeUs = RouterMetrics::total_lookup_time_us.load();
  uint64_t hits = RouterMetrics::cache_hits.load();
  uint64_t misses = RouterMetrics::cache_misses.load();

  if (lookups > 0) {
    metrics.Set("avgLookupTimeUs", Napi::Number::New(env, static_cast<double>(timeUs) / lookups));
    metrics.Set("simdUsagePercent", Napi::Number::New(env,
      static_cast<double>(RouterMetrics::simd_string_matches.load()) / lookups * 100.0));
  }

  if (hits + misses > 0) {
    metrics.Set("cacheHitRate", Napi::Number::New(env,
      static_cast<double>(hits) / (hits + misses) * 100.0));
  }

  return metrics;
}

// Get SIMD capabilities
Napi::Value RadixRouter::GetCapabilities(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::Object caps = Napi::Object::New(env);
  caps.Set("hasSSE42", Napi::Boolean::New(env, HasSSE42()));
  caps.Set("hasAVX2", Napi::Boolean::New(env, HasAVX2()));
  caps.Set("supportsSIMDStringMatching", Napi::Boolean::New(env, HasAVX2()));
  caps.Set("supportsLRUCache", Napi::Boolean::New(env, true));

  return caps;
}

// Benchmark router operations
Napi::Value RadixRouter::Benchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Create test routes
  std::vector<std::string> test_routes = {
    "/api/users",
    "/api/users/:id",
    "/api/users/:id/posts",
    "/api/users/:id/posts/:postId",
    "/static/*",
    "/health",
    "/metrics",
    "/api/v1/orders",
    "/api/v1/orders/:orderId",
    "/api/v2/products/:productId/reviews"
  };

  // Benchmark string comparison
  const std::string test_str1 = "/api/users/123/posts/456/comments/789";
  const std::string test_str2 = "/api/users/123/posts/456/comments/789";

  const int iterations = 100000;

  auto startTime = std::chrono::high_resolution_clock::now();

  for (int i = 0; i < iterations; ++i) {
    volatile int result = CompareStrings_SIMD(test_str1.c_str(), test_str2.c_str(), test_str1.length());
    (void)result; // Prevent optimization
  }

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  Napi::Object results = Napi::Object::New(env);
  results.Set("stringComparisonTimeUs", Napi::Number::New(env, static_cast<double>(duration) / iterations));
  results.Set("usedSIMD", Napi::Boolean::New(env, HasAVX2()));
  results.Set("testStringLength", Napi::Number::New(env, test_str1.length()));

  return results;
}

// Clear cache
Napi::Value RadixRouter::ClearCache(const Napi::CallbackInfo& info) {
  routeCache_.clear();
  cacheSize_ = 0;
  return info.Env().Undefined();
}
