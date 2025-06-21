#ifndef NEXUREJS_ADVANCED_SIMD_PROFILER_H
#define NEXUREJS_ADVANCED_SIMD_PROFILER_H

#include <napi.h>
#include <vector>
#include <unordered_map>
#include <string>
#include <chrono>

namespace nexurejs {

// SIMD Capability Detection
enum class SIMDCapability {
  SCALAR = 0,
  SSE42 = 1,
  AVX2 = 2,
  AVX512 = 3,
  ARM_NEON = 4,
  ARM_SVE = 5
};

// Performance metrics for SIMD operations
struct SIMDMetrics {
  uint64_t operations_count = 0;
  uint64_t simd_operations = 0;
  uint64_t scalar_operations = 0;
  uint64_t total_execution_time_ns = 0;
  uint64_t simd_execution_time_ns = 0;
  uint64_t scalar_execution_time_ns = 0;
  double simd_efficiency = 0.0;
  double throughput_ops_per_sec = 0.0;
};

// Advanced SIMD profiler class
class AdvancedSIMDProfiler : public Napi::ObjectWrap<AdvancedSIMDProfiler> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  AdvancedSIMDProfiler(const Napi::CallbackInfo& info);
  ~AdvancedSIMDProfiler() = default;

private:
  // JavaScript API methods
  Napi::Value DetectSIMDCapabilities(const Napi::CallbackInfo& info);
  Napi::Value ProfileVectorizedOperation(const Napi::CallbackInfo& info);
  Napi::Value BenchmarkSIMDEfficiency(const Napi::CallbackInfo& info);
  Napi::Value GetDetailedMetrics(const Napi::CallbackInfo& info);
  Napi::Value ResetProfiler(const Napi::CallbackInfo& info);
  Napi::Value OptimizationRecommendations(const Napi::CallbackInfo& info);

  // SIMD capability detection
  SIMDCapability DetectOptimalSIMD();
  bool HasAVX512();
  bool HasAVX2();
  bool HasSSE42();
  bool HasNEON();
  bool HasSVE();

  // Vectorized operation benchmarks
  void BenchmarkFloatOperations(std::vector<float>& data, SIMDMetrics& metrics);
  void BenchmarkIntegerOperations(std::vector<int32_t>& data, SIMDMetrics& metrics);
  void BenchmarkStringOperations(const std::string& data, SIMDMetrics& metrics);

  // SIMD implementations
#ifdef __x86_64__
  void AVX512FloatSum(const float* data, size_t size, SIMDMetrics& metrics);
  void AVX2FloatSum(const float* data, size_t size, SIMDMetrics& metrics);
  void SSE42FloatSum(const float* data, size_t size, SIMDMetrics& metrics);
#elif defined(__aarch64__)
  void NEONFloatSum(const float* data, size_t size, SIMDMetrics& metrics);
#endif
  void ScalarFloatSum(const float* data, size_t size, SIMDMetrics& metrics);

  // Performance analysis
  double CalculateSIMDEfficiency(const SIMDMetrics& metrics);
  std::vector<std::string> GenerateOptimizationRecommendations();

  // State
  SIMDCapability current_capability_;
  std::unordered_map<std::string, SIMDMetrics> operation_metrics_;
  bool profiling_enabled_ = true;
};

} // namespace nexurejs

#endif // NEXUREJS_ADVANCED_SIMD_PROFILER_H
