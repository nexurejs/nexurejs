#include <napi.h>
#include <vector>
#include <unordered_map>
#include <memory>
#include <cstring>
#include <chrono>
#include <algorithm>
#include <numa.h>

#ifdef __x86_64__
#include <immintrin.h>
#elif defined(__aarch64__)
#include <arm_neon.h>
#endif

namespace nexurejs {

// Cache line size constants
static constexpr size_t CACHE_LINE_SIZE = 64;
static constexpr size_t PAGE_SIZE = 4096;
static constexpr size_t HUGE_PAGE_SIZE = 2 * 1024 * 1024; // 2MB

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
struct alignas(CACHE_LINE_SIZE) CacheOptimizedBlock {
  void* data;
  size_t size;
  size_t alignment;
  int numa_node;
  std::chrono::high_resolution_clock::time_point last_access;
  uint64_t access_count;
  bool is_hot; // frequently accessed

  CacheOptimizedBlock() : data(nullptr), size(0), alignment(0), numa_node(-1),
                         access_count(0), is_hot(false) {
    last_access = std::chrono::high_resolution_clock::now();
  }
};

// Advanced memory optimizer
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

Napi::FunctionReference AdvancedMemoryOptimizer::constructor;

Napi::Object AdvancedMemoryOptimizer::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "AdvancedMemoryOptimizer", {
    InstanceMethod("allocateAligned", &AdvancedMemoryOptimizer::AllocateAligned),
    InstanceMethod("allocateNUMAAware", &AdvancedMemoryOptimizer::AllocateNUMAAware),
    InstanceMethod("deallocateMemory", &AdvancedMemoryOptimizer::DeallocateMemory),
    InstanceMethod("prefetchMemory", &AdvancedMemoryOptimizer::PrefetchMemory),
    InstanceMethod("optimizeForCache", &AdvancedMemoryOptimizer::OptimizeForCache),
    InstanceMethod("getMemoryMetrics", &AdvancedMemoryOptimizer::GetMemoryMetrics),
    InstanceMethod("compactMemory", &AdvancedMemoryOptimizer::CompactMemory),
    InstanceMethod("benchmarkMemoryPerformance", &AdvancedMemoryOptimizer::BenchmarkMemoryPerformance),
    InstanceMethod("getNUMATopology", &AdvancedMemoryOptimizer::GetNUMATopology),
    InstanceMethod("resetOptimizer", &AdvancedMemoryOptimizer::ResetOptimizer)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("AdvancedMemoryOptimizer", func);
  return exports;
}

AdvancedMemoryOptimizer::AdvancedMemoryOptimizer(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<AdvancedMemoryOptimizer>(info) {

  // Initialize NUMA support
  numa_available_ = (numa_available() != -1);
  current_numa_node_ = numa_available_ ? numa_node_of_cpu(sched_getcpu()) : 0;

  // Initialize configuration
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object configObj = info[0].As<Napi::Object>();

    if (configObj.Has("initialSize")) {
      config_.initial_size = configObj.Get("initialSize").As<Napi::Number>().Uint32Value();
    }
    if (configObj.Has("maxSize")) {
      config_.max_size = configObj.Get("maxSize").As<Napi::Number>().Uint32Value();
    }
    if (configObj.Has("useHugePages")) {
      config_.use_huge_pages = configObj.Get("useHugePages").As<Napi::Boolean>().Value();
    }
    if (configObj.Has("numaAware")) {
      config_.numa_aware = configObj.Get("numaAware").As<Napi::Boolean>().Value();
    }
  }

  start_time_ = std::chrono::high_resolution_clock::now();
}

AdvancedMemoryOptimizer::~AdvancedMemoryOptimizer() {
  // Clean up all allocated blocks
  for (auto& [ptr, block] : allocated_blocks_) {
    DeallocateAlignedMemory(ptr);
  }
  allocated_blocks_.clear();
  free_blocks_.clear();
}

Napi::Value AdvancedMemoryOptimizer::AllocateAligned(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected size parameter").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  size_t size = info[0].As<Napi::Number>().Uint32Value();
  size_t alignment = CACHE_LINE_SIZE; // Default to cache line alignment

  if (info.Length() > 1 && info[1].IsNumber()) {
    alignment = info[1].As<Napi::Number>().Uint32Value();
  }

  void* ptr = AllocateAlignedMemory(size, alignment);
  if (!ptr) {
    Napi::Error::New(env, "Failed to allocate aligned memory").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Create a buffer that wraps the allocated memory
  Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::New(env,
    static_cast<uint8_t*>(ptr), size, [](Napi::Env, uint8_t* data) {
      // Custom finalizer - memory will be managed by our optimizer
    });

  UpdateMemoryMetrics(size, true);

  Napi::Object result = Napi::Object::New(env);
  result.Set("buffer", buffer);
  result.Set("size", Napi::Number::New(env, size));
  result.Set("alignment", Napi::Number::New(env, alignment));
  result.Set("address", Napi::Number::New(env, reinterpret_cast<uintptr_t>(ptr)));

  return result;
}

Napi::Value AdvancedMemoryOptimizer::AllocateNUMAAware(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!numa_available_) {
    Napi::Error::New(env, "NUMA support not available").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected size parameter").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  size_t size = info[0].As<Napi::Number>().Uint32Value();
  int numa_node = DetectOptimalNUMANode();

  if (info.Length() > 1 && info[1].IsNumber()) {
    numa_node = info[1].As<Napi::Number>().Int32Value();
  }

  void* ptr = AllocateAlignedMemory(size, CACHE_LINE_SIZE, numa_node);
  if (!ptr) {
    Napi::Error::New(env, "Failed to allocate NUMA-aware memory").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  UpdateMemoryMetrics(size, true);
  if (numa_node == current_numa_node_) {
    metrics_.numa_local_allocations++;
  } else {
    metrics_.numa_remote_allocations++;
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("size", Napi::Number::New(env, size));
  result.Set("numaNode", Napi::Number::New(env, numa_node));
  result.Set("address", Napi::Number::New(env, reinterpret_cast<uintptr_t>(ptr)));

  return result;
}

Napi::Value AdvancedMemoryOptimizer::PrefetchMemory(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected address and size parameters").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uintptr_t address = info[0].As<Napi::Number>().Uint32Value();
  size_t size = info[1].As<Napi::Number>().Uint32Value();
  int locality = 3; // Default temporal locality

  if (info.Length() > 2 && info[2].IsNumber()) {
    locality = info[2].As<Napi::Number>().Int32Value();
  }

  void* ptr = reinterpret_cast<void*>(address);
  PrefetchData(ptr, size, locality);

  return Napi::Boolean::New(env, true);
}

Napi::Value AdvancedMemoryOptimizer::GetMemoryMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Calculate derived metrics
  metrics_.fragmentation_ratio = CalculateFragmentationRatio();
  metrics_.cache_hit_ratio = (metrics_.cache_hits + metrics_.cache_misses > 0) ?
    static_cast<double>(metrics_.cache_hits) / (metrics_.cache_hits + metrics_.cache_misses) : 0.0;

  auto current_time = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::seconds>(current_time - start_time_);
  metrics_.allocation_throughput = duration.count() > 0 ?
    static_cast<double>(metrics_.total_allocations) / duration.count() : 0.0;

  Napi::Object metrics = Napi::Object::New(env);
  metrics.Set("totalAllocations", Napi::Number::New(env, metrics_.total_allocations));
  metrics.Set("totalDeallocations", Napi::Number::New(env, metrics_.total_deallocations));
  metrics.Set("bytesAllocated", Napi::Number::New(env, metrics_.bytes_allocated));
  metrics.Set("bytesDeallocated", Napi::Number::New(env, metrics_.bytes_deallocated));
  metrics.Set("peakMemoryUsage", Napi::Number::New(env, metrics_.peak_memory_usage));
  metrics.Set("currentMemoryUsage", Napi::Number::New(env, metrics_.current_memory_usage));
  metrics.Set("cacheHits", Napi::Number::New(env, metrics_.cache_hits));
  metrics.Set("cacheMisses", Napi::Number::New(env, metrics_.cache_misses));
  metrics.Set("numaLocalAllocations", Napi::Number::New(env, metrics_.numa_local_allocations));
  metrics.Set("numaRemoteAllocations", Napi::Number::New(env, metrics_.numa_remote_allocations));
  metrics.Set("fragmentationRatio", Napi::Number::New(env, metrics_.fragmentation_ratio));
  metrics.Set("cacheHitRatio", Napi::Number::New(env, metrics_.cache_hit_ratio));
  metrics.Set("allocationThroughput", Napi::Number::New(env, metrics_.allocation_throughput));

  return metrics;
}

Napi::Value AdvancedMemoryOptimizer::BenchmarkMemoryPerformance(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  const size_t test_sizes[] = {1024, 4096, 16384, 65536, 262144, 1048576};
  const size_t num_iterations = 10000;

  Napi::Object results = Napi::Object::New(env);

  for (size_t size : test_sizes) {
    auto start = std::chrono::high_resolution_clock::now();

    // Allocation benchmark
    std::vector<void*> ptrs;
    ptrs.reserve(num_iterations);

    for (size_t i = 0; i < num_iterations; i++) {
      void* ptr = AllocateAlignedMemory(size, CACHE_LINE_SIZE);
      if (ptr) {
        ptrs.push_back(ptr);
      }
    }

    auto alloc_end = std::chrono::high_resolution_clock::now();

    // Memory access benchmark (SIMD-optimized)
    for (void* ptr : ptrs) {
      SIMDMemorySet(ptr, 0x42, size);
    }

    auto access_end = std::chrono::high_resolution_clock::now();

    // Deallocation benchmark
    for (void* ptr : ptrs) {
      DeallocateAlignedMemory(ptr);
    }

    auto dealloc_end = std::chrono::high_resolution_clock::now();

    // Calculate metrics
    auto alloc_time = std::chrono::duration_cast<std::chrono::nanoseconds>(alloc_end - start).count();
    auto access_time = std::chrono::duration_cast<std::chrono::nanoseconds>(access_end - alloc_end).count();
    auto dealloc_time = std::chrono::duration_cast<std::chrono::nanoseconds>(dealloc_end - access_end).count();

    Napi::Object size_result = Napi::Object::New(env);
    size_result.Set("allocationsPerSec", Napi::Number::New(env,
      (static_cast<double>(num_iterations) * 1e9) / alloc_time));
    size_result.Set("accessThroughputMBps", Napi::Number::New(env,
      (static_cast<double>(num_iterations * size) * 1e9) / (access_time * 1024 * 1024)));
    size_result.Set("deallocationsPerSec", Napi::Number::New(env,
      (static_cast<double>(num_iterations) * 1e9) / dealloc_time));

    results.Set(std::to_string(size), size_result);
  }

  return results;
}

Napi::Value AdvancedMemoryOptimizer::GetNUMATopology(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object topology = Napi::Object::New(env);

  if (!numa_available_) {
    topology.Set("available", Napi::Boolean::New(env, false));
    return topology;
  }

  topology.Set("available", Napi::Boolean::New(env, true));
  topology.Set("maxNodes", Napi::Number::New(env, numa_max_node() + 1));
  topology.Set("currentNode", Napi::Number::New(env, current_numa_node_));

  // Get memory information for each node
  Napi::Array nodes = Napi::Array::New(env);
  for (int node = 0; node <= numa_max_node(); node++) {
    if (numa_bitmask_isbitset(numa_get_mems_allowed(), node)) {
      Napi::Object nodeInfo = Napi::Object::New(env);
      nodeInfo.Set("nodeId", Napi::Number::New(env, node));

      long long freep, size;
      size = numa_node_size64(node, &freep);
      nodeInfo.Set("totalMemory", Napi::Number::New(env, size));
      nodeInfo.Set("freeMemory", Napi::Number::New(env, freep));

      nodes.Set(node, nodeInfo);
    }
  }
  topology.Set("nodes", nodes);

  return topology;
}

// Implementation of memory management functions
void* AdvancedMemoryOptimizer::AllocateAlignedMemory(size_t size, size_t alignment, int numa_node) {
  void* ptr = nullptr;

  if (numa_available_ && numa_node >= 0) {
    // NUMA-aware allocation
    ptr = numa_alloc_onnode(size, numa_node);
    if (ptr) {
      // Ensure alignment
      if (reinterpret_cast<uintptr_t>(ptr) % alignment != 0) {
        numa_free(ptr, size);
        ptr = nullptr;
      }
    }
  }

  if (!ptr) {
    // Fallback to aligned allocation
    if (posix_memalign(&ptr, alignment, size) != 0) {
      return nullptr;
    }
  }

  // Create and store block metadata
  auto block = std::make_unique<CacheOptimizedBlock>();
  block->data = ptr;
  block->size = size;
  block->alignment = alignment;
  block->numa_node = numa_node;

  allocated_blocks_[ptr] = std::move(block);

  return ptr;
}

void AdvancedMemoryOptimizer::DeallocateAlignedMemory(void* ptr) {
  auto it = allocated_blocks_.find(ptr);
  if (it != allocated_blocks_.end()) {
    const auto& block = it->second;

    if (numa_available_ && block->numa_node >= 0) {
      numa_free(ptr, block->size);
    } else {
      free(ptr);
    }

    UpdateMemoryMetrics(block->size, false);
    allocated_blocks_.erase(it);
  }
}

void AdvancedMemoryOptimizer::PrefetchData(void* ptr, size_t size, int locality) {
  const size_t prefetch_distance = CACHE_LINE_SIZE;

  for (size_t offset = 0; offset < size; offset += prefetch_distance) {
    char* addr = static_cast<char*>(ptr) + offset;

#ifdef __x86_64__
    switch (locality) {
      case 0: _mm_prefetch(addr, _MM_HINT_NTA); break;    // Non-temporal
      case 1: _mm_prefetch(addr, _MM_HINT_T2); break;     // L2 cache
      case 2: _mm_prefetch(addr, _MM_HINT_T1); break;     // L1 cache
      case 3: _mm_prefetch(addr, _MM_HINT_T0); break;     // All cache levels
    }
#elif defined(__aarch64__)
    // ARM prefetch instructions
    __builtin_prefetch(addr, 0, locality);
#endif
  }
}

void AdvancedMemoryOptimizer::SIMDMemorySet(void* ptr, int value, size_t size) {
  uint8_t* data = static_cast<uint8_t*>(ptr);

#ifdef __x86_64__
  // AVX2 implementation
  if (size >= 32) {
    __m256i value_vec = _mm256_set1_epi8(static_cast<char>(value));
    size_t simd_size = size - (size % 32);

    for (size_t i = 0; i < simd_size; i += 32) {
      _mm256_storeu_si256(reinterpret_cast<__m256i*>(&data[i]), value_vec);
    }

    // Handle remainder
    for (size_t i = simd_size; i < size; i++) {
      data[i] = static_cast<uint8_t>(value);
    }
  } else {
    memset(ptr, value, size);
  }
#elif defined(__aarch64__)
  // NEON implementation
  if (size >= 16) {
    uint8x16_t value_vec = vdupq_n_u8(static_cast<uint8_t>(value));
    size_t simd_size = size - (size % 16);

    for (size_t i = 0; i < simd_size; i += 16) {
      vst1q_u8(&data[i], value_vec);
    }

    // Handle remainder
    for (size_t i = simd_size; i < size; i++) {
      data[i] = static_cast<uint8_t>(value);
    }
  } else {
    memset(ptr, value, size);
  }
#else
  memset(ptr, value, size);
#endif
}

void AdvancedMemoryOptimizer::UpdateMemoryMetrics(size_t size, bool is_allocation) {
  if (is_allocation) {
    metrics_.total_allocations++;
    metrics_.bytes_allocated += size;
    metrics_.current_memory_usage += size;

    if (metrics_.current_memory_usage > metrics_.peak_memory_usage) {
      metrics_.peak_memory_usage = metrics_.current_memory_usage;
    }
  } else {
    metrics_.total_deallocations++;
    metrics_.bytes_deallocated += size;
    if (metrics_.current_memory_usage >= size) {
      metrics_.current_memory_usage -= size;
    }
  }
}

double AdvancedMemoryOptimizer::CalculateFragmentationRatio() {
  if (allocated_blocks_.empty()) return 0.0;

  size_t total_allocated = 0;
  size_t total_wasted = 0;

  for (const auto& [ptr, block] : allocated_blocks_) {
    total_allocated += block->size;

    // Calculate internal fragmentation due to alignment
    uintptr_t addr = reinterpret_cast<uintptr_t>(ptr);
    size_t alignment_waste = addr % block->alignment;
    total_wasted += alignment_waste;
  }

  return total_allocated > 0 ? static_cast<double>(total_wasted) / total_allocated : 0.0;
}

int AdvancedMemoryOptimizer::DetectOptimalNUMANode() {
  if (!numa_available_) return -1;

  // Use current CPU's NUMA node
  return numa_node_of_cpu(sched_getcpu());
}

} // namespace nexurejs
