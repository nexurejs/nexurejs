#ifndef NEXUREJS_LRU_CACHE_H
#define NEXUREJS_LRU_CACHE_H

#include <napi.h>
#include <unordered_map>
#include <list>
#include <string>
#include <chrono>
#include <memory>
#include <functional>

namespace nexurejs {

/**
 * High-performance LRU Cache implementation
 * Provides O(1) get/put operations with configurable TTL and capacity
 */
class LRUCache : public Napi::ObjectWrap<LRUCache> {
public:
  // Static constructor and initialization
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  // Constructor
  LRUCache(const Napi::CallbackInfo& info);
  ~LRUCache();

  // Static methods for singleton access
  static Napi::Value GetInstance(const Napi::CallbackInfo& info);
  static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
  // Type definitions for cache implementation
  struct CacheEntry {
    std::string key;
    Napi::ObjectReference value;
    int64_t expiry;  // Timestamp for TTL (0 = no expiry)
  };

  using CacheList = std::list<CacheEntry>;
  using CacheMap = std::unordered_map<std::string, CacheList::iterator>;

  // Cache properties
  size_t capacity_;
  int64_t defaultTtl_;  // in milliseconds, 0 = no expiry
  CacheList itemList_;  // Sorted by recency (most recent at front)
  CacheMap itemMap_;    // Maps keys to positions in the list
  Napi::ObjectReference metricsObject_;

  // Cache statistics
  size_t hits_ = 0;
  size_t misses_ = 0;
  size_t evictions_ = 0;
  size_t expirations_ = 0;
  size_t insertions_ = 0;
  size_t updates_ = 0;

  // Exposed methods
  Napi::Value Get(const Napi::CallbackInfo& info);
  Napi::Value Set(const Napi::CallbackInfo& info);
  Napi::Value Has(const Napi::CallbackInfo& info);
  Napi::Value Delete(const Napi::CallbackInfo& info);
  Napi::Value Clear(const Napi::CallbackInfo& info);
  Napi::Value GetSize(const Napi::CallbackInfo& info);
  Napi::Value GetCapacity(const Napi::CallbackInfo& info);
  Napi::Value SetCapacity(const Napi::CallbackInfo& info);
  Napi::Value GetKeys(const Napi::CallbackInfo& info);
  Napi::Value GetValues(const Napi::CallbackInfo& info);
  Napi::Value GetEntries(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
  Napi::Value PruneExpired(const Napi::CallbackInfo& info);

  // Internal methods
  void removeItem(CacheMap::iterator it);
  void updateMetrics();
  int64_t getCurrentTimestamp() const;
  bool isExpired(const CacheEntry& entry) const;
  void pruneExpiredItems();
};

} // namespace nexurejs

#endif // NEXUREJS_LRU_CACHE_H
