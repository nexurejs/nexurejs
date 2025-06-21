#ifndef MEMORY_MANAGER_H
#define MEMORY_MANAGER_H

#include <napi.h>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>

// Memory block structure for tracking allocations
struct MemoryBlock {
  void* ptr;
  size_t size;
  std::chrono::steady_clock::time_point allocated_at;
  bool in_use;

  MemoryBlock(void* p, size_t s)
    : ptr(p), size(s), allocated_at(std::chrono::steady_clock::now()), in_use(true) {}
};

// Memory pool for specific size ranges
struct MemoryPool {
  size_t block_size;
  std::vector<std::unique_ptr<MemoryBlock>> available_blocks;
  std::vector<std::unique_ptr<MemoryBlock>> used_blocks;
  std::mutex pool_mutex;
  std::atomic<uint64_t> total_allocations{0};
  std::atomic<uint64_t> total_deallocations{0};
  std::atomic<uint64_t> pool_hits{0};
  std::atomic<uint64_t> pool_misses{0};

  MemoryPool(size_t size) : block_size(size) {}
  ~MemoryPool();

  void* allocate();
  bool deallocate(void* ptr);
  void cleanup_expired(std::chrono::seconds max_age);
  size_t get_available_count() const { return available_blocks.size(); }
  size_t get_used_count() const { return used_blocks.size(); }
  double get_hit_rate() const;
};

class MemoryManager : public Napi::ObjectWrap<MemoryManager> {
public:
  // Initialization and constructor
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  MemoryManager(const Napi::CallbackInfo& info);
  ~MemoryManager();

  // Public API methods
  Napi::Value Allocate(const Napi::CallbackInfo& info);
  Napi::Value Deallocate(const Napi::CallbackInfo& info);
  Napi::Value Reallocate(const Napi::CallbackInfo& info);
  Napi::Value GetPoolStats(const Napi::CallbackInfo& info);
  Napi::Value GetGlobalStats(const Napi::CallbackInfo& info);
  Napi::Value ResetStats(const Napi::CallbackInfo& info);
  Napi::Value GarbageCollect(const Napi::CallbackInfo& info);
  Napi::Value SIMDMemcpy(const Napi::CallbackInfo& info);
  Napi::Value SIMDMemset(const Napi::CallbackInfo& info);
  Napi::Value SIMDMemcmp(const Napi::CallbackInfo& info);

  // Static methods
  static Napi::Value GetCapabilities(const Napi::CallbackInfo& info);
  static Napi::Value Benchmark(const Napi::CallbackInfo& info);

  // Alignment utilities (public for MemoryPool access)
  static void* AlignedAlloc(size_t size, size_t alignment = 32);
  static void AlignedFree(void* ptr);
  static bool IsAligned(void* ptr, size_t alignment = 32);

private:
  // SIMD capability detection
  static bool HasAVX2();
  static bool HasSSE42();

  // SIMD-optimized memory operations
  static void* SIMDMemcpy_Internal(void* dest, const void* src, size_t size);
  static void* SIMDMemset_Internal(void* dest, int value, size_t size);
  static int SIMDMemcmp_Internal(const void* ptr1, const void* ptr2, size_t size);

  // Scalar fallback operations
  static void* ScalarMemcpy(void* dest, const void* src, size_t size);
  static void* ScalarMemset(void* dest, int value, size_t size);
  static int ScalarMemcmp(const void* ptr1, const void* ptr2, size_t size);

  // Memory pool management
  void* AllocateFromPool(size_t size);
  bool DeallocateToPool(void* ptr, size_t size);
  size_t GetOptimalPoolSize(size_t requested_size);
  void InitializePools();
  void CleanupPools();
  void GarbageCollectPools();



  // Performance tracking
  void UpdateAllocationMetrics(size_t size, bool pool_hit);
  void UpdateDeallocationMetrics(size_t size, bool pool_hit);
  void UpdateSIMDMetrics(const std::string& operation, size_t size,
                        std::chrono::microseconds duration);

  // Member variables
  std::unordered_map<size_t, std::unique_ptr<MemoryPool>> pools_;
  std::mutex pools_mutex_;

  // Supported pool sizes (powers of 2 and common sizes)
  static const std::vector<size_t> POOL_SIZES;

  // Configuration
  size_t max_pool_blocks_;
  std::chrono::seconds max_block_age_;
  bool enable_garbage_collection_;
  bool enable_simd_operations_;

  // Global statistics
  std::atomic<uint64_t> total_allocations_{0};
  std::atomic<uint64_t> total_deallocations_{0};
  std::atomic<uint64_t> total_allocated_bytes_{0};
  std::atomic<uint64_t> total_deallocated_bytes_{0};
  std::atomic<uint64_t> pool_hits_{0};
  std::atomic<uint64_t> pool_misses_{0};
  std::atomic<uint64_t> simd_operations_{0};
  std::atomic<uint64_t> simd_bytes_processed_{0};

  // Performance metrics
  std::atomic<uint64_t> total_allocation_time_us_{0};
  std::atomic<uint64_t> total_deallocation_time_us_{0};
  std::atomic<uint64_t> total_simd_time_us_{0};

  // Memory tracking for safety
  std::unordered_map<void*, size_t> active_allocations_;
  std::mutex allocations_mutex_;
};

#endif // MEMORY_MANAGER_H
