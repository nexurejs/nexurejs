#include "lru_cache.h"
#include <napi.h>
#include <unordered_map>
#include <list>
#include <string>
#include <chrono>
#include <memory>
#include <functional>

namespace nexurejs {

// Static member initialization
Napi::FunctionReference LRUCache::constructor;

/*
 * Member variables overview:
 * size_t capacity_;
 * int64_t defaultTtl_;  // in milliseconds, 0 = no expiry
 * CacheList itemList_;  // Sorted by recency (most recent at front)
 * CacheMap itemMap_;    // Maps keys to positions in the list
 * Napi::ObjectReference metricsObject_;
 *
 * Cache statistics:
 * size_t hits_ = 0;
 * size_t misses_ = 0;
 * size_t evictions_ = 0;
 * size_t expirations_ = 0;
 * size_t insertions_ = 0;
 * size_t updates_ = 0;
 */

// Initialize the class and add it to exports
Napi::Object LRUCache::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "LRUCache", {
    InstanceMethod("get", &LRUCache::Get),
    InstanceMethod("set", &LRUCache::Set),
    InstanceMethod("has", &LRUCache::Has),
    InstanceMethod("delete", &LRUCache::Delete),
    InstanceMethod("clear", &LRUCache::Clear),
    InstanceMethod("getSize", &LRUCache::GetSize),
    InstanceMethod("getCapacity", &LRUCache::GetCapacity),
    InstanceMethod("setCapacity", &LRUCache::SetCapacity),
    InstanceMethod("getKeys", &LRUCache::GetKeys),
    InstanceMethod("getValues", &LRUCache::GetValues),
    InstanceMethod("getEntries", &LRUCache::GetEntries),
    InstanceMethod("getMetrics", &LRUCache::GetMetrics),
    InstanceMethod("resetMetrics", &LRUCache::ResetMetrics),
    InstanceMethod("pruneExpired", &LRUCache::PruneExpired),
    StaticMethod("getInstance", &LRUCache::GetInstance),
    StaticMethod("resetMetrics", &LRUCache::ResetMetricsStatic),
  });

  constructor = Napi::Persistent(func);
  exports.Set("LRUCache", func);
  return exports;
}

// Constructor implementation
LRUCache::LRUCache(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<LRUCache>(info) {
  Napi::Env env = info.Env();

  // Set default values
  capacity_ = 1000;  // Default capacity
  defaultTtl_ = 0;   // Default TTL (0 = no expiry)

  // Parse options if provided
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    // Set capacity if provided
    if (options.Has("capacity") && options.Get("capacity").IsNumber()) {
      capacity_ = options.Get("capacity").As<Napi::Number>().Uint32Value();
    }

    // Set TTL if provided
    if (options.Has("ttl") && options.Get("ttl").IsNumber()) {
      defaultTtl_ = options.Get("ttl").As<Napi::Number>().Int64Value();
    }
  }

  // Initialize metrics object
  Napi::Object metrics = Napi::Object::New(env);
  metrics.Set("hits", Napi::Number::New(env, 0));
  metrics.Set("misses", Napi::Number::New(env, 0));
  metrics.Set("evictions", Napi::Number::New(env, 0));
  metrics.Set("expirations", Napi::Number::New(env, 0));
  metrics.Set("insertions", Napi::Number::New(env, 0));
  metrics.Set("updates", Napi::Number::New(env, 0));
  metrics.Set("hitRatio", Napi::Number::New(env, 0));
  metricsObject_ = Napi::Persistent(metrics);
}

// Destructor implementation
LRUCache::~LRUCache() {
  // Clear all items to release references
  itemList_.clear();
  itemMap_.clear();
}

// Get current timestamp in milliseconds
int64_t LRUCache::getCurrentTimestamp() const {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()
  ).count();
}

// Check if an entry is expired
bool LRUCache::isExpired(const CacheEntry& entry) const {
  return entry.expiry > 0 && getCurrentTimestamp() > entry.expiry;
}

// Get a value from the cache
Napi::Value LRUCache::Get(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String key expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string key = info[0].As<Napi::String>().Utf8Value();
  auto it = itemMap_.find(key);

  // Check if item exists in cache
  if (it == itemMap_.end()) {
    misses_++;
    updateMetrics();
    return env.Undefined();
  }

  // Get entry from list
  CacheEntry& entry = *(it->second);

  // Check if entry is expired
  if (isExpired(entry)) {
    // Remove expired entry
    removeItem(it);
    expirations_++;
    misses_++;
    updateMetrics();
    return env.Undefined();
  }

  // Move to front of list (most recently used)
  itemList_.splice(itemList_.begin(), itemList_, it->second);

  // Update statistics
  hits_++;
  updateMetrics();

  // Return the value
  return entry.value.Value();
}

// Set a value in the cache
Napi::Value LRUCache::Set(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 2 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Key and value expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string key = info[0].As<Napi::String>().Utf8Value();
  Napi::Value value = info[1];

  // Calculate expiry time
  int64_t ttl = defaultTtl_;
  if (info.Length() >= 3 && info[2].IsNumber()) {
    ttl = info[2].As<Napi::Number>().Int64Value();
  }

  int64_t expiry = ttl > 0 ? getCurrentTimestamp() + ttl : 0;

  // Check if key already exists
  auto it = itemMap_.find(key);
  if (it != itemMap_.end()) {
    // Update existing entry
    CacheEntry& entry = *(it->second);
    // Store a new reference and release the old one
    entry.value.Reset(value);
    entry.expiry = expiry;

    // Move to front of list
    itemList_.splice(itemList_.begin(), itemList_, it->second);
    updates_++;
  } else {
    // Create new entry
    CacheEntry newEntry;
    newEntry.key = key;
    newEntry.value = Napi::Persistent(value);
    newEntry.expiry = expiry;

    // Add to front of list
    itemList_.push_front(std::move(newEntry));

    // Add to map
    itemMap_[key] = itemList_.begin();
    insertions_++;

    // Check if we've exceeded capacity
    if (itemMap_.size() > capacity_) {
      // Remove least recently used item
      auto last = --itemList_.end();
      std::string keyToRemove = last->key;
      itemMap_.erase(keyToRemove);
      itemList_.pop_back();
      evictions_++;
    }
  }

  updateMetrics();
  return env.Undefined();
}

// Check if key exists in cache
Napi::Value LRUCache::Has(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String key expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string key = info[0].As<Napi::String>().Utf8Value();
  auto it = itemMap_.find(key);

  if (it == itemMap_.end()) {
    return Napi::Boolean::New(env, false);
  }

  // Check if entry is expired
  if (isExpired(*(it->second))) {
    return Napi::Boolean::New(env, false);
  }

  return Napi::Boolean::New(env, true);
}

// Delete an item from the cache
Napi::Value LRUCache::Delete(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String key expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string key = info[0].As<Napi::String>().Utf8Value();
  auto it = itemMap_.find(key);

  if (it != itemMap_.end()) {
    // Remove the item from list and map
    removeItem(it);
    return Napi::Boolean::New(env, true);
  }

  return Napi::Boolean::New(env, false);
}

// Clear the cache
Napi::Value LRUCache::Clear(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Clear all items
  itemList_.clear();
  itemMap_.clear();

  // Reset metrics
  hits_ = 0;
  misses_ = 0;
  evictions_ = 0;
  expirations_ = 0;
  insertions_ = 0;
  updates_ = 0;

  updateMetrics();

  return env.Undefined();
}

// Get current cache size
Napi::Value LRUCache::GetSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, itemMap_.size());
}

// Get cache capacity
Napi::Value LRUCache::GetCapacity(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, capacity_);
}

// Set cache capacity
Napi::Value LRUCache::SetCapacity(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  size_t newCapacity = info[0].As<Napi::Number>().Uint32Value();

  // Don't allow zero capacity
  if (newCapacity == 0) {
    Napi::Error::New(env, "Capacity must be greater than zero").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  capacity_ = newCapacity;

  // Prune the cache if we've exceeded the new capacity
  while (itemMap_.size() > capacity_) {
    // Remove least recently used item
    auto last = --itemList_.end();
    std::string keyToRemove = last->key;
    itemMap_.erase(keyToRemove);
    itemList_.pop_back();
    evictions_++;
  }

  updateMetrics();

  return Napi::Number::New(env, capacity_);
}

// Get all keys in the cache
Napi::Value LRUCache::GetKeys(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array keys = Napi::Array::New(env);

  uint32_t i = 0;
  // Iterate in the order of recency
  for (const auto& entry : itemList_) {
    // Skip expired entries
    if (isExpired(entry)) continue;
    keys.Set(i++, Napi::String::New(env, entry.key));
  }

  return keys;
}

// Get all values in the cache
Napi::Value LRUCache::GetValues(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array values = Napi::Array::New(env);

  uint32_t i = 0;
  // Iterate in the order of recency
  for (const auto& entry : itemList_) {
    // Skip expired entries
    if (isExpired(entry)) continue;
    values.Set(i++, entry.value.Value());
  }

  return values;
}

// Get all entries in the cache
Napi::Value LRUCache::GetEntries(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array entries = Napi::Array::New(env);

  uint32_t i = 0;
  // Iterate in the order of recency
  for (const auto& entry : itemList_) {
    // Skip expired entries
    if (isExpired(entry)) continue;

    Napi::Object pair = Napi::Object::New(env);
    pair.Set("key", Napi::String::New(env, entry.key));
    pair.Set("value", entry.value.Value());

    entries.Set(i++, pair);
  }

  return entries;
}

// Get cache metrics
Napi::Value LRUCache::GetMetrics(const Napi::CallbackInfo& info) {
  updateMetrics();
  return metricsObject_.Value();
}

// Reset cache metrics
Napi::Value LRUCache::ResetMetrics(const Napi::CallbackInfo& info) {
  hits_ = 0;
  misses_ = 0;
  evictions_ = 0;
  expirations_ = 0;
  insertions_ = 0;
  updates_ = 0;

  updateMetrics();

  return metricsObject_.Value();
}

// Prune expired items
Napi::Value LRUCache::PruneExpired(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  pruneExpiredItems();

  return Napi::Number::New(env, itemMap_.size());
}

// Remove item from cache
void LRUCache::removeItem(CacheMap::iterator it) {
  auto listIt = it->second;
  itemList_.erase(listIt);
  itemMap_.erase(it);
}

// Update metrics object
void LRUCache::updateMetrics() {
  Napi::Env env = metricsObject_.Env();
  Napi::Object metrics = metricsObject_.Value().As<Napi::Object>();

  metrics.Set("hits", Napi::Number::New(env, hits_));
  metrics.Set("misses", Napi::Number::New(env, misses_));
  metrics.Set("evictions", Napi::Number::New(env, evictions_));
  metrics.Set("expirations", Napi::Number::New(env, expirations_));
  metrics.Set("insertions", Napi::Number::New(env, insertions_));
  metrics.Set("updates", Napi::Number::New(env, updates_));

  // Calculate hit ratio
  double requests = hits_ + misses_;
  double hitRatio = requests > 0 ? (double)hits_ / requests : 0;
  metrics.Set("hitRatio", Napi::Number::New(env, hitRatio));

  // Additional metrics
  metrics.Set("size", Napi::Number::New(env, itemMap_.size()));
  metrics.Set("capacity", Napi::Number::New(env, capacity_));
}

// Prune expired items
void LRUCache::pruneExpiredItems() {
  int64_t now = getCurrentTimestamp();

  // Iterate through the list and remove expired items
  auto it = itemList_.begin();
  while (it != itemList_.end()) {
    if (it->expiry > 0 && now > it->expiry) {
      // Get the key for the map lookup
      std::string key = it->key;

      // Erase from map first
      itemMap_.erase(key);

      // Erase from list and get the next iterator
      it = itemList_.erase(it);

      expirations_++;
    } else {
      ++it;
    }
  }

  updateMetrics();
}

// Static method to get singleton instance
Napi::Value LRUCache::GetInstance(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Create a static variable to hold our singleton instance
  static Napi::ObjectReference instance;

  // If we don't have an instance yet or it's empty, create one
  if (instance.IsEmpty()) {
    // Get constructor from reference
    Napi::Function ctor = constructor.Value();

    // Create options object if provided
    Napi::Value arg = info.Length() > 0 && info[0].IsObject()
      ? info[0]
      : Napi::Object::New(env);

    // Create a new instance
    Napi::Object obj = ctor.New({arg});

    // Store it
    instance = Napi::Persistent(obj);
  }

  return instance.Value();
}

// Static method to reset metrics on the singleton instance
Napi::Value LRUCache::ResetMetricsStatic(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Get the instance first
  Napi::Value instanceValue = GetInstance(info);

  // If we have an instance, call resetMetrics on it
  if (instanceValue.IsObject()) {
    Napi::Object instance = instanceValue.As<Napi::Object>();
    Napi::Function resetMetrics = instance.Get("resetMetrics").As<Napi::Function>();
    resetMetrics.Call(instance, {});
  }

  return env.Undefined();
}

} // namespace nexurejs
