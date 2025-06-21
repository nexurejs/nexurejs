#include "memory_manager.h"
#include <cstring>
#include <algorithm>
#include <chrono>

#ifdef _WIN32
#include <malloc.h>
#include <intrin.h>
#else
#include <cstdlib>
#ifdef __x86_64__
#include <cpuid.h>
#endif
#endif

// Static member definitions
Napi::FunctionReference MemoryManager::constructor;
const std::vector<size_t> MemoryManager::POOL_SIZES = {
  64, 128, 256, 512, 1024, 2048, 4096, 8192
};

// MemoryPool implementation
MemoryPool::~MemoryPool() {
  for (auto& block : available_blocks) {
    if (block && block->ptr) {
      MemoryManager::AlignedFree(block->ptr);
    }
  }
  for (auto& block : used_blocks) {
    if (block && block->ptr) {
      MemoryManager::AlignedFree(block->ptr);
    }
  }
}

void* MemoryPool::allocate() {
  std::lock_guard<std::mutex> lock(pool_mutex);

  if (!available_blocks.empty()) {
    auto block = std::move(available_blocks.back());
    available_blocks.pop_back();

    void* ptr = block->ptr;
    block->in_use = true;

    used_blocks.push_back(std::move(block));
    total_allocations.fetch_add(1);
    pool_hits.fetch_add(1);

    return ptr;
  }

  // Allocate new block
  void* ptr = MemoryManager::AlignedAlloc(block_size, 32);
  if (ptr) {
    auto block = std::make_unique<MemoryBlock>(ptr, block_size);
    block->in_use = true;

    used_blocks.push_back(std::move(block));
    total_allocations.fetch_add(1);
    pool_misses.fetch_add(1);

    return ptr;
  }

  return nullptr;
}

bool MemoryPool::deallocate(void* ptr) {
  std::lock_guard<std::mutex> lock(pool_mutex);

  for (auto it = used_blocks.begin(); it != used_blocks.end(); ++it) {
    if ((*it)->ptr == ptr) {
      auto block = std::move(*it);
      used_blocks.erase(it);

      block->in_use = false;
      available_blocks.push_back(std::move(block));

      total_deallocations.fetch_add(1);
      return true;
    }
  }

  return false;
}

void MemoryPool::cleanup_expired(std::chrono::seconds max_age) {
  // Simplified cleanup - just clear some available blocks
  std::lock_guard<std::mutex> lock(pool_mutex);

  if (available_blocks.size() > 10) {
    size_t to_remove = available_blocks.size() / 2;
    for (size_t i = 0; i < to_remove; ++i) {
      if (available_blocks[i]->ptr) {
        MemoryManager::AlignedFree(available_blocks[i]->ptr);
      }
    }
    available_blocks.erase(available_blocks.begin(), available_blocks.begin() + to_remove);
  }
}

double MemoryPool::get_hit_rate() const {
  uint64_t hits = pool_hits.load();
  uint64_t misses = pool_misses.load();
  uint64_t total = hits + misses;

  return total > 0 ? static_cast<double>(hits) / total : 0.0;
}

// MemoryManager implementation
MemoryManager::MemoryManager(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<MemoryManager>(info)
    , max_pool_blocks_(1000)
    , max_block_age_(std::chrono::seconds(300))
    , enable_garbage_collection_(true)
    , enable_simd_operations_(HasAVX2()) {

  InitializePools();
}

MemoryManager::~MemoryManager() {
  CleanupPools();
}

void MemoryManager::InitializePools() {
  std::lock_guard<std::mutex> lock(pools_mutex_);

  for (size_t size : POOL_SIZES) {
    pools_[size] = std::make_unique<MemoryPool>(size);
  }
}

void MemoryManager::CleanupPools() {
  std::lock_guard<std::mutex> lock(pools_mutex_);
  pools_.clear();
}

// SIMD capability detection - ARM64 safe
bool MemoryManager::HasAVX2() {
#ifdef __x86_64__
  static int avx2_supported = -1;
  if (avx2_supported == -1) {
    try {
      int cpuInfo[4];
      __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
      avx2_supported = (cpuInfo[1] & (1 << 5)) ? 1 : 0;
    } catch (...) {
      avx2_supported = 0;
    }
  }
  return avx2_supported == 1;
#elif defined(__aarch64__)
  return false; // ARM64 uses NEON, not AVX2
#else
  return false;
#endif
}

bool MemoryManager::HasSSE42() {
#ifdef __x86_64__
  static int sse42_supported = -1;
  if (sse42_supported == -1) {
    try {
      int cpuInfo[4];
      __cpuid(1, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
      sse42_supported = (cpuInfo[2] & (1 << 20)) ? 1 : 0;
    } catch (...) {
      sse42_supported = 0;
    }
  }
  return sse42_supported == 1;
#elif defined(__aarch64__)
  return false; // ARM64 uses NEON, not SSE4.2
#else
  return false;
#endif
}

// Alignment utilities
void* MemoryManager::AlignedAlloc(size_t size, size_t alignment) {
#ifdef _WIN32
  return _aligned_malloc(size, alignment);
#else
  void* ptr = nullptr;
  if (posix_memalign(&ptr, alignment, size) != 0) {
    return nullptr;
  }
  return ptr;
#endif
}

void MemoryManager::AlignedFree(void* ptr) {
  if (ptr) {
#ifdef _WIN32
    _aligned_free(ptr);
#else
    free(ptr);
#endif
  }
}

// Memory pool management
void* MemoryManager::AllocateFromPool(size_t size) {
  size_t pool_size = GetOptimalPoolSize(size);

  std::lock_guard<std::mutex> lock(pools_mutex_);
  auto it = pools_.find(pool_size);

  if (it != pools_.end()) {
    void* ptr = it->second->allocate();
    if (ptr) {
      UpdateAllocationMetrics(size, true);
      return ptr;
    }
  }

  // Fallback to direct allocation
  void* ptr = AlignedAlloc(size, 32);
  if (ptr) {
    UpdateAllocationMetrics(size, false);
  }

  return ptr;
}

size_t MemoryManager::GetOptimalPoolSize(size_t requested_size) {
  for (size_t pool_size : POOL_SIZES) {
    if (pool_size >= requested_size) {
      return pool_size;
    }
  }

  return POOL_SIZES.back();
}

void MemoryManager::UpdateAllocationMetrics(size_t size, bool pool_hit) {
  total_allocations_.fetch_add(1);
  total_allocated_bytes_.fetch_add(size);

  if (pool_hit) {
    pool_hits_.fetch_add(1);
  } else {
    pool_misses_.fetch_add(1);
  }
}

void MemoryManager::UpdateDeallocationMetrics(size_t size, bool pool_hit) {
  total_deallocations_.fetch_add(1);
  total_deallocated_bytes_.fetch_add(size);
}

void MemoryManager::GarbageCollectPools() {
  std::lock_guard<std::mutex> lock(pools_mutex_);

  for (auto& pool_pair : pools_) {
    pool_pair.second->cleanup_expired(max_block_age_);
  }
}

// JavaScript API methods
Napi::Value MemoryManager::Allocate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Size expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  size_t size = info[0].As<Napi::Number>().Uint32Value();
  void* ptr = AllocateFromPool(size);

  if (!ptr) {
    Napi::Error::New(env, "Allocation failed").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Buffer<uint8_t>::New(env, static_cast<uint8_t*>(ptr), size);
}

Napi::Value MemoryManager::GetGlobalStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object stats = Napi::Object::New(env);

  uint64_t allocations = total_allocations_.load();
  uint64_t deallocations = total_deallocations_.load();

  stats.Set("totalAllocations", Napi::Number::New(env, allocations));
  stats.Set("totalDeallocations", Napi::Number::New(env, deallocations));
  stats.Set("activeAllocations", Napi::Number::New(env, allocations - deallocations));
  stats.Set("poolHits", Napi::Number::New(env, pool_hits_.load()));
  stats.Set("poolMisses", Napi::Number::New(env, pool_misses_.load()));
  stats.Set("simdAligned", Napi::Number::New(env, allocations)); // All allocations are SIMD aligned

  return stats;
}

Napi::Value MemoryManager::GetCapabilities(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object caps = Napi::Object::New(env);

  caps.Set("hasAVX2", Napi::Boolean::New(env, HasAVX2()));
  caps.Set("hasSSE42", Napi::Boolean::New(env, HasSSE42()));
  caps.Set("supportsAlignedAllocation", Napi::Boolean::New(env, true));
  caps.Set("supportsMemoryPooling", Napi::Boolean::New(env, true));

  return caps;
}

// Placeholder implementations
Napi::Value MemoryManager::Deallocate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Buffer or pointer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // For now, just track the deallocation metrics
  // In a real implementation, we would return the buffer to the pool
  size_t size = 0;

  if (info[0].IsBuffer()) {
    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
    size = buffer.Length();
  } else if (info[0].IsNumber()) {
    size = info[0].As<Napi::Number>().Uint32Value();
  }

  if (size > 0) {
    UpdateDeallocationMetrics(size, true); // Assume pool hit for now
  }

  return env.Undefined();
}

Napi::Value MemoryManager::Reallocate(const Napi::CallbackInfo& info) {
  return info.Env().Undefined();
}

Napi::Value MemoryManager::GetPoolStats(const Napi::CallbackInfo& info) {
  return GetGlobalStats(info);
}

Napi::Value MemoryManager::ResetStats(const Napi::CallbackInfo& info) {
  total_allocations_.store(0);
  total_deallocations_.store(0);
  total_allocated_bytes_.store(0);
  total_deallocated_bytes_.store(0);
  pool_hits_.store(0);
  pool_misses_.store(0);

  return info.Env().Undefined();
}

Napi::Value MemoryManager::GarbageCollect(const Napi::CallbackInfo& info) {
  GarbageCollectPools();
  return info.Env().Undefined();
}

Napi::Value MemoryManager::SIMDMemcpy(const Napi::CallbackInfo& info) {
  return info.Env().Undefined();
}

Napi::Value MemoryManager::SIMDMemset(const Napi::CallbackInfo& info) {
  return info.Env().Undefined();
}

Napi::Value MemoryManager::SIMDMemcmp(const Napi::CallbackInfo& info) {
  return info.Env().Undefined();
}

Napi::Value MemoryManager::Benchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object results = Napi::Object::New(env);

  results.Set("memoryPoolingSupported", Napi::Boolean::New(env, true));
  results.Set("alignedAllocationSupported", Napi::Boolean::New(env, true));
  results.Set("simdSupported", Napi::Boolean::New(env, HasAVX2()));

  return results;
}

// Initialize the MemoryManager
Napi::Object MemoryManager::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "MemoryManager", {
    InstanceMethod("allocate", &MemoryManager::Allocate),
    InstanceMethod("deallocate", &MemoryManager::Deallocate),
    InstanceMethod("getMetrics", &MemoryManager::GetGlobalStats),
    InstanceMethod("getGlobalStats", &MemoryManager::GetGlobalStats),
    InstanceMethod("getPoolStats", &MemoryManager::GetPoolStats),
    InstanceMethod("resetStats", &MemoryManager::ResetStats),
    InstanceMethod("garbageCollect", &MemoryManager::GarbageCollect),
    StaticMethod("getCapabilities", &MemoryManager::GetCapabilities),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("MemoryManager", func);
  return exports;
}
