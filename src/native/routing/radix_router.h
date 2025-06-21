#ifndef RADIX_ROUTER_H
#define RADIX_ROUTER_H

#include <napi.h>
#include <vector>
#include <string>
#include <memory>
#include <unordered_map>
#include <list>
#include <atomic>
#include <map>

// Route node structure for radix tree
struct RouteNode {
  std::string prefix;
  bool is_endpoint = false;
  Napi::FunctionReference handler;
  std::vector<std::unique_ptr<RouteNode>> children;

  RouteNode() = default;
  ~RouteNode() = default;

  // Move constructor and assignment
  RouteNode(RouteNode&& other) noexcept
    : prefix(std::move(other.prefix))
    , is_endpoint(other.is_endpoint)
    , handler(std::move(other.handler))
    , children(std::move(other.children)) {}

  RouteNode& operator=(RouteNode&& other) noexcept {
    if (this != &other) {
      prefix = std::move(other.prefix);
      is_endpoint = other.is_endpoint;
      handler = std::move(other.handler);
      children = std::move(other.children);
    }
    return *this;
  }

  // Disable copy constructor and assignment
  RouteNode(const RouteNode&) = delete;
  RouteNode& operator=(const RouteNode&) = delete;
};

// Route matching result
struct RouteMatch {
  bool found;
  Napi::FunctionReference handler;
};

// Cache entry structure
struct CacheEntry {
  Napi::ObjectReference result;
  std::list<std::string>::iterator lru_iterator;
};

class RadixRouter : public Napi::ObjectWrap<RadixRouter> {
public:
  // Initialization and constructor
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  RadixRouter(const Napi::CallbackInfo& info);
  ~RadixRouter();

  // Public API methods
  Napi::Value Add(const Napi::CallbackInfo& info);
  Napi::Value Find(const Napi::CallbackInfo& info);
  Napi::Value Remove(const Napi::CallbackInfo& info);
  Napi::Value Insert(const Napi::CallbackInfo& info);
  Napi::Value Lookup(const Napi::CallbackInfo& info);
  Napi::Value ClearCache(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);

  // Static methods
  static Napi::Value GetCapabilities(const Napi::CallbackInfo& info);
  static Napi::Value Benchmark(const Napi::CallbackInfo& info);

private:
  // SIMD capability detection
  static bool HasAVX2();
  static bool HasSSE42();

  // SIMD optimization methods
  static int CompareStrings_SIMD(const char* str1, const char* str2, size_t length);
  static size_t FindCommonPrefix_SIMD(const char* str1, const char* str2, size_t max_length);
  static bool MatchPattern_SIMD(const std::string& pattern, const std::string& path);
  static bool MatchPatternScalar(const std::string& pattern, const std::string& path);

  // Internal routing methods
  void InsertRoute(const std::string& route, const Napi::Function& handler);
  RouteMatch LookupRoute(const std::string& route, std::map<std::string, std::string>& params);
  void SplitNode(RouteNode* node, size_t split_pos);

  // Legacy methods for backward compatibility
  void AddRoute(const std::string& path, const Napi::Function& handler);
  Napi::Value FindRoute(const std::string& path, std::map<std::string, std::string>& params);
  bool RemoveRoute(const std::string& path);

  // Member variables
  std::unique_ptr<RouteNode> root_;

  // LRU cache for route lookups
  std::unordered_map<std::string, CacheEntry> cache_;
  std::list<std::string> cache_order_;
  size_t cache_capacity_;

  // Legacy cache (for backward compatibility)
  std::unordered_map<std::string, Napi::FunctionReference> routeCache_;
  size_t cacheSize_ = 0;
  size_t maxCacheSize_ = 1000;
};

#endif // RADIX_ROUTER_H
