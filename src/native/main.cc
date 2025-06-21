#include <napi.h>
#include "memory/memory_manager.h"
#include "encoding/string_encoder.h"
#include "thread/thread_pool.h"
#include "validation/validation_engine.h"
#include "compression/compression_engine.h"
#include "stream/stream_processor.h"
#include "rate/rate_limiter.h"
#include "url/url_parser.h"

// Add safe implementations
#include "http/http_parser_safe.cc"
#include "http/object_pool_safe.cc"

// Phase 2 optimization modules
#include "simd/advanced_simd_profiler.h"

#ifdef _WIN32
#include <windows.h>
#include <intrin.h>
#elif defined(__x86_64__) || defined(__i386__)
#include <cpuid.h>
#include <immintrin.h>
#endif

// Forward declaration for simplified memory optimizer
namespace nexurejs {
  class AdvancedMemoryOptimizer : public Napi::ObjectWrap<AdvancedMemoryOptimizer> {
  public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
  };
}

// Global performance metrics
namespace NexureMetrics {
  std::atomic<uint64_t> totalRequests{0};
  std::atomic<uint64_t> totalResponseTime{0};
  std::atomic<uint64_t> simdOperations{0};
  std::atomic<uint64_t> memoryPoolHits{0};
  std::atomic<uint64_t> compressionOperations{0};
  std::atomic<uint64_t> advancedMemoryOperations{0};
  std::atomic<uint64_t> simdProfilerOperations{0};
}

// SIMD capability detection - ARM64 safe
bool DetectSIMDCapabilities() {
#ifdef __x86_64__
  try {
    int cpuInfo[4];
    __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    bool hasAVX2 = (cpuInfo[1] & (1 << 5)) != 0;

    __cpuid(1, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    bool hasSSE42 = (cpuInfo[2] & (1 << 20)) != 0;

    return hasAVX2 && hasSSE42;
  } catch (...) {
    return false;
  }
#elif defined(__aarch64__)
  // ARM64 has NEON by default
  return true;
#else
  return false;
#endif
}

// Safe CPU info detection
void GetCPUInfo(Napi::Object& sysInfo, Napi::Env env) {
#ifdef __x86_64__
  try {
    int cpuInfo[4];
    __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    sysInfo.Set("hasAVX2", Napi::Boolean::New(env, (cpuInfo[1] & (1 << 5)) != 0));
    sysInfo.Set("hasAVX512", Napi::Boolean::New(env, (cpuInfo[1] & (1 << 16)) != 0));

    __cpuid(1, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    sysInfo.Set("hasSSE42", Napi::Boolean::New(env, (cpuInfo[2] & (1 << 20)) != 0));
    sysInfo.Set("hasAES", Napi::Boolean::New(env, (cpuInfo[2] & (1 << 25)) != 0));
  } catch (...) {
    sysInfo.Set("hasAVX2", Napi::Boolean::New(env, false));
    sysInfo.Set("hasAVX512", Napi::Boolean::New(env, false));
    sysInfo.Set("hasSSE42", Napi::Boolean::New(env, false));
    sysInfo.Set("hasAES", Napi::Boolean::New(env, false));
  }
#elif defined(__aarch64__)
  // ARM64 capabilities
  sysInfo.Set("hasNEON", Napi::Boolean::New(env, true));
  sysInfo.Set("hasAVX2", Napi::Boolean::New(env, false));
  sysInfo.Set("hasAVX512", Napi::Boolean::New(env, false));
  sysInfo.Set("hasSSE42", Napi::Boolean::New(env, false));
  sysInfo.Set("hasAES", Napi::Boolean::New(env, true)); // ARM64 crypto extensions
#else
  sysInfo.Set("hasAVX2", Napi::Boolean::New(env, false));
  sysInfo.Set("hasAVX512", Napi::Boolean::New(env, false));
  sysInfo.Set("hasSSE42", Napi::Boolean::New(env, false));
  sysInfo.Set("hasAES", Napi::Boolean::New(env, false));
#endif
}

// Initialize all native modules and optimizations
Napi::Object InitializeNexureNative(Napi::Env env, Napi::Object exports) {
  try {
    // Core HTTP parsing (Safe implementation)
    nexurejs::SafeHttpParser::Init(env, exports);

    // Object pool for HTTP parser (Safe implementation)
    nexurejs::SafeObjectPool::Init(env, exports);

    // Memory management
    MemoryManager::Init(env, exports);

    // Advanced memory optimizer - Phase 2 optimization (simplified)
    nexurejs::AdvancedMemoryOptimizer::Init(env, exports);

    // Advanced SIMD profiler - Phase 2 optimization
    nexurejs::AdvancedSIMDProfiler::Init(env, exports);

    // String encoding
    nexurejs::StringEncoder::Init(env, exports);

    // Thread pool
    nexurejs::ThreadPool::Init(env, exports);

    // Validation engine
    nexurejs::ValidationEngine::Init(env, exports);

    // Compression engine
    nexurejs::CompressionEngine::Init(env, exports);

    // Stream processor
    nexurejs::StreamProcessor::Init(env, exports);

    // Rate limiter
    nexurejs::RateLimiter::Init(env, exports);

    // URL parser
    UrlParser::Init(env, exports);

    // SIMD support detection
    exports.Set("simdSupported", Napi::Boolean::New(env, DetectSIMDCapabilities()));

    // Performance utilities
    exports.Set("getGlobalMetrics", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
      Napi::Env env = info.Env();
      Napi::Object metrics = Napi::Object::New(env);

      metrics.Set("totalRequests", Napi::Number::New(env, NexureMetrics::totalRequests.load()));
      metrics.Set("totalResponseTime", Napi::Number::New(env, NexureMetrics::totalResponseTime.load()));
      metrics.Set("simdOperations", Napi::Number::New(env, NexureMetrics::simdOperations.load()));
      metrics.Set("memoryPoolHits", Napi::Number::New(env, NexureMetrics::memoryPoolHits.load()));
      metrics.Set("compressionOperations", Napi::Number::New(env, NexureMetrics::compressionOperations.load()));
      metrics.Set("advancedMemoryOperations", Napi::Number::New(env, NexureMetrics::advancedMemoryOperations.load()));
      metrics.Set("simdProfilerOperations", Napi::Number::New(env, NexureMetrics::simdProfilerOperations.load()));

      // Calculate derived metrics
      uint64_t requests = NexureMetrics::totalRequests.load();
      uint64_t responseTime = NexureMetrics::totalResponseTime.load();

      if (requests > 0) {
        metrics.Set("avgResponseTime", Napi::Number::New(env, static_cast<double>(responseTime) / requests));
        metrics.Set("simdUsagePercent", Napi::Number::New(env,
          static_cast<double>(NexureMetrics::simdOperations.load()) / requests * 100.0));
        metrics.Set("advancedOptimizationPercent", Napi::Number::New(env,
          static_cast<double>(NexureMetrics::advancedMemoryOperations.load() + NexureMetrics::simdProfilerOperations.load()) / requests * 100.0));
      }

      return metrics;
    }));

    // Reset metrics function
    exports.Set("resetGlobalMetrics", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
      NexureMetrics::totalRequests.store(0);
      NexureMetrics::totalResponseTime.store(0);
      NexureMetrics::simdOperations.store(0);
      NexureMetrics::memoryPoolHits.store(0);
      NexureMetrics::compressionOperations.store(0);
      NexureMetrics::advancedMemoryOperations.store(0);
      NexureMetrics::simdProfilerOperations.store(0);
      return info.Env().Undefined();
    }));

    // System information
    exports.Set("getSystemInfo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
      Napi::Env env = info.Env();
      Napi::Object sysInfo = Napi::Object::New(env);

      sysInfo.Set("simdSupported", Napi::Boolean::New(env, DetectSIMDCapabilities()));
      sysInfo.Set("advancedOptimizations", Napi::Boolean::New(env, true));
      sysInfo.Set("phase2Enabled", Napi::Boolean::New(env, true));

      // Safe CPU info detection
      GetCPUInfo(sysInfo, env);

      sysInfo.Set("architecture", Napi::String::New(env,
#ifdef __x86_64__
        "x86_64"
#elif defined(__aarch64__)
        "aarch64"
#elif defined(__arm__)
        "arm"
#else
        "unknown"
#endif
      ));

      return sysInfo;
    }));

    // Version information
    exports.Set("version", Napi::String::New(env, "1.3.0-phase2"));
    exports.Set("isNative", Napi::Boolean::New(env, true));
    exports.Set("buildDate", Napi::String::New(env, __DATE__ " " __TIME__));
    exports.Set("optimizationPhase", Napi::String::New(env, "Phase 2: Advanced Optimizations"));

    return exports;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Initialization failed: ") + e.what()).ThrowAsJavaScriptException();
    return exports;
  } catch (...) {
    Napi::Error::New(env, "Unknown initialization error").ThrowAsJavaScriptException();
    return exports;
  }
}

// Node.js module initialization
NODE_API_MODULE(nexure_native, InitializeNexureNative)
