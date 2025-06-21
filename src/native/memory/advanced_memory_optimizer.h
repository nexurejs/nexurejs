#ifndef NEXUREJS_ADVANCED_MEMORY_OPTIMIZER_H
#define NEXUREJS_ADVANCED_MEMORY_OPTIMIZER_H

#include <napi.h>
#include <vector>
#include <unordered_map>
#include <memory>
#include <chrono>

namespace nexurejs {

// Memory pool configuration
struct MemoryPoolConfig {
  size_t initial_size = 1024 * 1024; // 1MB
  size_t max_size = 100 * 1024 * 1024; // 100MB
  size_t growth_factor = 2;
  bool use_huge_pages = false;
  bool numa_aware = true;
  int numa_node = -1; // -1 for automatic detection
};

// Advanced memory metrics
struct AdvancedMemoryMetrics {
  uint64_t total_allocations = 0;
  uint64_t total_deallocations = 0;
  uint64_t bytes_allocated = 0;
  uint64_t bytes_deallocated = 0;
  uint64_t peak_memory_usage = 0;
  uint64_t current_memory_usage = 0;
  uint64_t cache_hits = 0;
  uint64_t cache_misses = 0;
  uint64_t numa_local_allocations = 0;
  uint64_t numa_remote_allocations = 0;
  double fragmentation_ratio = 0.0;
  double cache_hit_ratio = 0.0;
  double allocation_throughput = 0.0; // allocations per second
};

// Cache-optimized memory block
struct alignas(64) CacheOptimizedBlock {
  void* data;
  size_t size;
  size_t alignment;
  int numa_node;
  std::chrono::high_resolution_clock::time_point last_access;
  uint64_t access_count;
  bool is_hot; // frequently accessed

  CacheOptimizedBlock();
};

// Advanced memory optimizer class
class AdvancedMemoryOptimizer : public Napi::ObjectWrap<AdvancedMemoryOptimizer> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  AdvancedMemoryOptimizer(const Napi::CallbackInfo& info);
  ~AdvancedMemoryOptimizer();

private:
  // JavaScript API methods
  Napi::Value AllocateAligned(const Napi::CallbackInfo& info);
  Napi::Value AllocateNUMAAware(const Napi::CallbackInfo& info);
  Napi::Value DeallocateMemory(const Napi::CallbackInfo& info);
  Napi::Value PrefetchMemory(const Napi::CallbackInfo& info);
  Napi::Value OptimizeForCache(const Napi::CallbackInfo& info);
  Napi::Value GetMemoryMetrics(const Napi::CallbackInfo& info);
  Napi::Value CompactMemory(const Napi::CallbackInfo& info);
  Napi::Value BenchmarkMemoryPerformance(const Napi::CallbackInfo& info);
  Napi::Value GetNUMATopology(const Napi::CallbackInfo& info);
  Napi::Value ResetOptimizer(const Napi::CallbackInfo& info);

  // Memory management
  void* AllocateAlignedMemory(size_t size, size_t alignment, int numa_node = -1);
  void DeallocateAlignedMemory(void* ptr);
  void PrefetchData(void* ptr, size_t size, int locality = 3);

  // Cache optimization
  void OptimizeDataLayout(void* data, size_t size);
  void ReorderForCacheLocality(std::vector<void*>& pointers);

  // NUMA optimization
  int DetectOptimalNUMANode();
  void MigrateToNUMANode(void* ptr, size_t size, int target_node);

  // Memory compaction
  void CompactMemoryPool();
  void DefragmentMemory();

  // Performance analysis
  void UpdateMemoryMetrics(size_t size, bool is_allocation);
  double CalculateFragmentationRatio();
  void AnalyzeAccessPatterns();

  // SIMD-optimized memory operations
  void SIMDMemoryCopy(void* dest, const void* src, size_t size);
  void SIMDMemorySet(void* ptr, int value, size_t size);
  int SIMDMemoryCompare(const void* ptr1, const void* ptr2, size_t size);

  // State management
  MemoryPoolConfig config_;
  AdvancedMemoryMetrics metrics_;
  std::unordered_map<void*, std::unique_ptr<CacheOptimizedBlock>> allocated_blocks_;
  std::vector<void*> free_blocks_;
  bool numa_available_;
  int current_numa_node_;
  std::chrono::high_resolution_clock::time_point start_time_;
};

} // namespace nexurejs

#endif // NEXUREJS_ADVANCED_MEMORY_OPTIMIZER_H
