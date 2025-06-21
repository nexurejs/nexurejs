#include <napi.h>
#include <chrono>
#include <vector>
#include <unordered_map>
#include <string>
#include <memory>

#ifdef __x86_64__
#include <immintrin.h>
#include <cpuid.h>
#elif defined(__aarch64__)
#include <arm_neon.h>
#endif

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

// Advanced SIMD profiler
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

Napi::FunctionReference AdvancedSIMDProfiler::constructor;

Napi::Object AdvancedSIMDProfiler::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "AdvancedSIMDProfiler", {
    InstanceMethod("detectSIMDCapabilities", &AdvancedSIMDProfiler::DetectSIMDCapabilities),
    InstanceMethod("profileVectorizedOperation", &AdvancedSIMDProfiler::ProfileVectorizedOperation),
    InstanceMethod("benchmarkSIMDEfficiency", &AdvancedSIMDProfiler::BenchmarkSIMDEfficiency),
    InstanceMethod("getDetailedMetrics", &AdvancedSIMDProfiler::GetDetailedMetrics),
    InstanceMethod("resetProfiler", &AdvancedSIMDProfiler::ResetProfiler),
    InstanceMethod("getOptimizationRecommendations", &AdvancedSIMDProfiler::OptimizationRecommendations)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("AdvancedSIMDProfiler", func);
  return exports;
}

AdvancedSIMDProfiler::AdvancedSIMDProfiler(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<AdvancedSIMDProfiler>(info) {
  current_capability_ = DetectOptimalSIMD();
}

Napi::Value AdvancedSIMDProfiler::DetectSIMDCapabilities(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object capabilities = Napi::Object::New(env);

  // Detect all available SIMD capabilities
  capabilities.Set("hasSSE42", Napi::Boolean::New(env, HasSSE42()));
  capabilities.Set("hasAVX2", Napi::Boolean::New(env, HasAVX2()));
  capabilities.Set("hasAVX512", Napi::Boolean::New(env, HasAVX512()));
  capabilities.Set("hasNEON", Napi::Boolean::New(env, HasNEON()));
  capabilities.Set("hasSVE", Napi::Boolean::New(env, HasSVE()));

  // Current optimal capability
  std::string optimal_simd;
  switch (current_capability_) {
    case SIMDCapability::AVX512: optimal_simd = "AVX512"; break;
    case SIMDCapability::AVX2: optimal_simd = "AVX2"; break;
    case SIMDCapability::SSE42: optimal_simd = "SSE42"; break;
    case SIMDCapability::ARM_NEON: optimal_simd = "ARM_NEON"; break;
    case SIMDCapability::ARM_SVE: optimal_simd = "ARM_SVE"; break;
    default: optimal_simd = "SCALAR"; break;
  }
  capabilities.Set("optimalSIMD", Napi::String::New(env, optimal_simd));

  // Architecture information
#ifdef __x86_64__
  capabilities.Set("architecture", Napi::String::New(env, "x86_64"));
  capabilities.Set("vectorWidth", Napi::Number::New(env,
    (current_capability_ == SIMDCapability::AVX512) ? 512 :
    (current_capability_ == SIMDCapability::AVX2) ? 256 : 128));
#elif defined(__aarch64__)
  capabilities.Set("architecture", Napi::String::New(env, "aarch64"));
  capabilities.Set("vectorWidth", Napi::Number::New(env,
    (current_capability_ == SIMDCapability::ARM_SVE) ? 2048 : 128));
#else
  capabilities.Set("architecture", Napi::String::New(env, "unknown"));
  capabilities.Set("vectorWidth", Napi::Number::New(env, 0));
#endif

  return capabilities;
}

Napi::Value AdvancedSIMDProfiler::ProfileVectorizedOperation(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsArray()) {
    Napi::TypeError::New(env, "Expected operation name and data array").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string operation = info[0].As<Napi::String>().Utf8Value();
  Napi::Array dataArray = info[1].As<Napi::Array>();

  // Convert JavaScript array to native vector
  std::vector<float> data;
  data.reserve(dataArray.Length());

  for (uint32_t i = 0; i < dataArray.Length(); i++) {
    Napi::Value element = dataArray.Get(i);
    if (element.IsNumber()) {
      data.push_back(element.As<Napi::Number>().FloatValue());
    }
  }

  if (data.empty()) {
    Napi::Error::New(env, "Empty data array").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Profile the operation
  SIMDMetrics metrics;
  BenchmarkFloatOperations(data, metrics);

  // Store metrics
  operation_metrics_[operation] = metrics;

  // Return profiling results
  Napi::Object result = Napi::Object::New(env);
  result.Set("operation", Napi::String::New(env, operation));
  result.Set("dataSize", Napi::Number::New(env, data.size()));
  result.Set("simdOperations", Napi::Number::New(env, metrics.simd_operations));
  result.Set("scalarOperations", Napi::Number::New(env, metrics.scalar_operations));
  result.Set("simdEfficiency", Napi::Number::New(env, metrics.simd_efficiency));
  result.Set("throughputOpsPerSec", Napi::Number::New(env, metrics.throughput_ops_per_sec));
  result.Set("totalTimeNs", Napi::Number::New(env, metrics.total_execution_time_ns));

  return result;
}

Napi::Value AdvancedSIMDProfiler::BenchmarkSIMDEfficiency(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Create test data of various sizes
  std::vector<size_t> test_sizes = {64, 256, 1024, 4096, 16384, 65536};
  Napi::Object results = Napi::Object::New(env);

  for (size_t size : test_sizes) {
    std::vector<float> test_data(size);

    // Initialize with random data
    for (size_t i = 0; i < size; i++) {
      test_data[i] = static_cast<float>(i) * 0.1f;
    }

    SIMDMetrics metrics;
    BenchmarkFloatOperations(test_data, metrics);

    Napi::Object size_result = Napi::Object::New(env);
    size_result.Set("simdEfficiency", Napi::Number::New(env, metrics.simd_efficiency));
    size_result.Set("throughputOpsPerSec", Napi::Number::New(env, metrics.throughput_ops_per_sec));
    size_result.Set("simdSpeedup", Napi::Number::New(env,
      metrics.scalar_execution_time_ns > 0 ?
      static_cast<double>(metrics.scalar_execution_time_ns) / metrics.simd_execution_time_ns : 1.0));

    results.Set(std::to_string(size), size_result);
  }

  return results;
}

Napi::Value AdvancedSIMDProfiler::GetDetailedMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  for (const auto& [operation, metric] : operation_metrics_) {
    Napi::Object op_metrics = Napi::Object::New(env);
    op_metrics.Set("operationsCount", Napi::Number::New(env, metric.operations_count));
    op_metrics.Set("simdOperations", Napi::Number::New(env, metric.simd_operations));
    op_metrics.Set("scalarOperations", Napi::Number::New(env, metric.scalar_operations));
    op_metrics.Set("totalExecutionTimeNs", Napi::Number::New(env, metric.total_execution_time_ns));
    op_metrics.Set("simdExecutionTimeNs", Napi::Number::New(env, metric.simd_execution_time_ns));
    op_metrics.Set("scalarExecutionTimeNs", Napi::Number::New(env, metric.scalar_execution_time_ns));
    op_metrics.Set("simdEfficiency", Napi::Number::New(env, metric.simd_efficiency));
    op_metrics.Set("throughputOpsPerSec", Napi::Number::New(env, metric.throughput_ops_per_sec));

    metrics.Set(operation, op_metrics);
  }

  return metrics;
}

Napi::Value AdvancedSIMDProfiler::ResetProfiler(const Napi::CallbackInfo& info) {
  operation_metrics_.clear();
  return info.Env().Undefined();
}

Napi::Value AdvancedSIMDProfiler::OptimizationRecommendations(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array recommendations = Napi::Array::New(env);

  auto recs = GenerateOptimizationRecommendations();
  for (size_t i = 0; i < recs.size(); i++) {
    recommendations.Set(i, Napi::String::New(env, recs[i]));
  }

  return recommendations;
}

// SIMD Capability Detection Implementation
SIMDCapability AdvancedSIMDProfiler::DetectOptimalSIMD() {
#ifdef __x86_64__
  if (HasAVX512()) return SIMDCapability::AVX512;
  if (HasAVX2()) return SIMDCapability::AVX2;
  if (HasSSE42()) return SIMDCapability::SSE42;
#elif defined(__aarch64__)
  if (HasSVE()) return SIMDCapability::ARM_SVE;
  if (HasNEON()) return SIMDCapability::ARM_NEON;
#endif
  return SIMDCapability::SCALAR;
}

bool AdvancedSIMDProfiler::HasAVX512() {
#ifdef __x86_64__
  try {
    int cpuInfo[4];
    __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    return (cpuInfo[1] & (1 << 16)) != 0; // AVX512F
  } catch (...) {
    return false;
  }
#else
  return false;
#endif
}

bool AdvancedSIMDProfiler::HasAVX2() {
#ifdef __x86_64__
  try {
    int cpuInfo[4];
    __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    return (cpuInfo[1] & (1 << 5)) != 0; // AVX2
  } catch (...) {
    return false;
  }
#else
  return false;
#endif
}

bool AdvancedSIMDProfiler::HasSSE42() {
#ifdef __x86_64__
  try {
    int cpuInfo[4];
    __cpuid(1, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    return (cpuInfo[2] & (1 << 20)) != 0; // SSE4.2
  } catch (...) {
    return false;
  }
#else
  return false;
#endif
}

bool AdvancedSIMDProfiler::HasNEON() {
#ifdef __aarch64__
  return true; // NEON is standard on ARM64
#else
  return false;
#endif
}

bool AdvancedSIMDProfiler::HasSVE() {
#ifdef __aarch64__
  // SVE detection would require system calls or feature registers
  // For now, return false as SVE is not widely available yet
  return false;
#else
  return false;
#endif
}

// Benchmark implementations
void AdvancedSIMDProfiler::BenchmarkFloatOperations(std::vector<float>& data, SIMDMetrics& metrics) {
  const size_t iterations = 1000;
  auto start_time = std::chrono::high_resolution_clock::now();

  // SIMD benchmark
  auto simd_start = std::chrono::high_resolution_clock::now();
  for (size_t i = 0; i < iterations; i++) {
#ifdef __x86_64__
    if (current_capability_ == SIMDCapability::AVX512) {
      AVX512FloatSum(data.data(), data.size(), metrics);
    } else if (current_capability_ == SIMDCapability::AVX2) {
      AVX2FloatSum(data.data(), data.size(), metrics);
    } else if (current_capability_ == SIMDCapability::SSE42) {
      SSE42FloatSum(data.data(), data.size(), metrics);
    }
#elif defined(__aarch64__)
    if (current_capability_ == SIMDCapability::ARM_NEON) {
      NEONFloatSum(data.data(), data.size(), metrics);
    }
#endif
  }
  auto simd_end = std::chrono::high_resolution_clock::now();
  metrics.simd_execution_time_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(simd_end - simd_start).count();

  // Scalar benchmark
  auto scalar_start = std::chrono::high_resolution_clock::now();
  for (size_t i = 0; i < iterations; i++) {
    ScalarFloatSum(data.data(), data.size(), metrics);
  }
  auto scalar_end = std::chrono::high_resolution_clock::now();
  metrics.scalar_execution_time_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(scalar_end - scalar_start).count();

  auto end_time = std::chrono::high_resolution_clock::now();
  metrics.total_execution_time_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(end_time - start_time).count();

  metrics.operations_count = iterations * 2; // SIMD + Scalar
  metrics.simd_operations = iterations;
  metrics.scalar_operations = iterations;
  metrics.simd_efficiency = CalculateSIMDEfficiency(metrics);
  metrics.throughput_ops_per_sec = (static_cast<double>(metrics.operations_count) * 1e9) / metrics.total_execution_time_ns;
}

#ifdef __x86_64__
void AdvancedSIMDProfiler::AVX2FloatSum(const float* data, size_t size, SIMDMetrics& metrics) {
  __m256 sum = _mm256_setzero_ps();
  size_t simd_size = size - (size % 8);

  for (size_t i = 0; i < simd_size; i += 8) {
    __m256 vec = _mm256_loadu_ps(&data[i]);
    sum = _mm256_add_ps(sum, vec);
  }

  // Handle remainder
  for (size_t i = simd_size; i < size; i++) {
    // Scalar remainder
  }
}
#endif

#ifdef __aarch64__
void AdvancedSIMDProfiler::NEONFloatSum(const float* data, size_t size, SIMDMetrics& metrics) {
  float32x4_t sum = vdupq_n_f32(0.0f);
  size_t simd_size = size - (size % 4);

  for (size_t i = 0; i < simd_size; i += 4) {
    float32x4_t vec = vld1q_f32(&data[i]);
    sum = vaddq_f32(sum, vec);
  }

  // Handle remainder
  for (size_t i = simd_size; i < size; i++) {
    // Scalar remainder
  }
}
#endif

void AdvancedSIMDProfiler::ScalarFloatSum(const float* data, size_t size, SIMDMetrics& metrics) {
  float sum = 0.0f;
  for (size_t i = 0; i < size; i++) {
    sum += data[i];
  }
}

double AdvancedSIMDProfiler::CalculateSIMDEfficiency(const SIMDMetrics& metrics) {
  if (metrics.scalar_execution_time_ns == 0) return 0.0;

  double speedup = static_cast<double>(metrics.scalar_execution_time_ns) / metrics.simd_execution_time_ns;

  // Theoretical maximum speedup based on vector width
  double theoretical_max = 0.0;
  switch (current_capability_) {
    case SIMDCapability::AVX512: theoretical_max = 16.0; break; // 512/32 for float
    case SIMDCapability::AVX2: theoretical_max = 8.0; break;   // 256/32 for float
    case SIMDCapability::SSE42: theoretical_max = 4.0; break;  // 128/32 for float
    case SIMDCapability::ARM_NEON: theoretical_max = 4.0; break; // 128/32 for float
    default: theoretical_max = 1.0; break;
  }

  return (speedup / theoretical_max) * 100.0; // Efficiency as percentage
}

std::vector<std::string> AdvancedSIMDProfiler::GenerateOptimizationRecommendations() {
  std::vector<std::string> recommendations;

  // Analyze current metrics and generate recommendations
  double avg_efficiency = 0.0;
  size_t total_ops = 0;

  for (const auto& [operation, metrics] : operation_metrics_) {
    avg_efficiency += metrics.simd_efficiency;
    total_ops += metrics.operations_count;
  }

  if (!operation_metrics_.empty()) {
    avg_efficiency /= operation_metrics_.size();
  }

  if (avg_efficiency < 50.0) {
    recommendations.push_back("Low SIMD efficiency detected. Consider optimizing data alignment and access patterns.");
  }

  if (current_capability_ == SIMDCapability::SCALAR) {
    recommendations.push_back("No SIMD support detected. Consider enabling compiler SIMD flags or upgrading hardware.");
  }

  if (HasAVX512() && current_capability_ != SIMDCapability::AVX512) {
    recommendations.push_back("AVX512 support available but not utilized. Consider implementing AVX512 optimizations.");
  }

  recommendations.push_back("Consider implementing memory prefetching for large data sets.");
  recommendations.push_back("Optimize loop unrolling for better instruction-level parallelism.");

  return recommendations;
}

} // namespace nexurejs
