#include <napi.h>
#include <vector>
#include <cstring>
#include <atomic>
#include <chrono>
#include <algorithm>
#include <memory>
#include <type_traits>

#ifdef __x86_64__
#include <immintrin.h> // For x86 SIMD
#include <xmmintrin.h> // SSE
#include <emmintrin.h> // SSE2
#include <pmmintrin.h> // SSE3
#include <smmintrin.h> // SSE4.1
#include <nmmintrin.h> // SSE4.2
#include <avxintrin.h> // AVX
#include <avx2intrin.h> // AVX2
#elif defined(__ARM_NEON)
#include <arm_neon.h>
#endif

namespace nexurejs {

/**
 * SIMDOptimizer - High-performance vectorized operations
 * Provides SIMD-accelerated operations for maximum performance
 */
class SIMDOptimizer : public Napi::ObjectWrap<SIMDOptimizer> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  SIMDOptimizer(const Napi::CallbackInfo& info);
  ~SIMDOptimizer() = default;

  // SIMD capability detection
  static bool HasAVX2();
  static bool HasSSE42();

  // Array operations
  Napi::Value ArraySumFloat32(const Napi::CallbackInfo& info);
  Napi::Value ArraySumFloat64(const Napi::CallbackInfo& info);
  Napi::Value ArrayMultiply(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);

  // Static methods
  static Napi::Value GetCapabilities(const Napi::CallbackInfo& info);
  static Napi::Value Benchmark(const Napi::CallbackInfo& info);

private:
  // SIMD implementations
  static float SumArray_SIMD(const float* data, size_t length);
  static double SumArray_SIMD(const double* data, size_t length);
  static void MultiplyArrays_SIMD(const float* a, const float* b, float* result, size_t length);

  // Update metrics
  static void UpdateMetrics(size_t bytes, int64_t timeUs, bool usedSIMD);
};

// Static members
Napi::FunctionReference SIMDOptimizer::constructor;

// Initialize the module
Napi::Object SIMDOptimizer::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "SIMDOptimizer", {
    InstanceMethod("arraySumFloat32", &SIMDOptimizer::ArraySumFloat32),
    InstanceMethod("arraySumFloat64", &SIMDOptimizer::ArraySumFloat64),
    InstanceMethod("arrayMultiply", &SIMDOptimizer::ArrayMultiply),
    InstanceMethod("getMetrics", &SIMDOptimizer::GetMetrics),
    StaticMethod("getCapabilities", &SIMDOptimizer::GetCapabilities),
    StaticMethod("benchmark", &SIMDOptimizer::Benchmark),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("SIMDOptimizer", func);
  return exports;
}

// Constructor
SIMDOptimizer::SIMDOptimizer(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<SIMDOptimizer>(info) {
}

// Check SIMD capabilities
bool SIMDOptimizer::HasAVX2() {
#ifdef __x86_64__
  static int avx2_supported = -1;
  if (avx2_supported == -1) {
    int cpuInfo[4];
    __cpuid_count(7, 0, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    avx2_supported = (cpuInfo[1] & (1 << 5)) ? 1 : 0;
  }
  return avx2_supported == 1;
#else
  return false;
#endif
}

bool SIMDOptimizer::HasSSE42() {
#ifdef __x86_64__
  static int sse42_supported = -1;
  if (sse42_supported == -1) {
    int cpuInfo[4];
    __cpuid(1, cpuInfo[0], cpuInfo[1], cpuInfo[2], cpuInfo[3]);
    sse42_supported = (cpuInfo[2] & (1 << 20)) ? 1 : 0;
  }
  return sse42_supported == 1;
#else
  return false;
#endif
}

// SIMD array sum for float32
float SIMDOptimizer::SumArray_SIMD(const float* data, size_t length) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 8) {
    // Scalar fallback
    float sum = 0.0f;
    for (size_t i = 0; i < length; ++i) {
      sum += data[i];
    }
    return sum;
  }

  const size_t simd_width = 8;
  const size_t simd_iterations = length / simd_width;

  __m256 sum_vec = _mm256_setzero_ps();

  // Process 8 floats at a time
  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256 data_vec = _mm256_loadu_ps(&data[i * simd_width]);
    sum_vec = _mm256_add_ps(sum_vec, data_vec);
  }

  // Horizontal sum
  __m128 sum128 = _mm_add_ps(_mm256_extractf128_ps(sum_vec, 0), _mm256_extractf128_ps(sum_vec, 1));
  sum128 = _mm_hadd_ps(sum128, sum128);
  sum128 = _mm_hadd_ps(sum128, sum128);

  float sum = _mm_cvtss_f32(sum128);

  // Handle remaining elements
  for (size_t i = simd_iterations * simd_width; i < length; ++i) {
    sum += data[i];
  }

  return sum;
#else
  float sum = 0.0f;
  for (size_t i = 0; i < length; ++i) {
    sum += data[i];
  }
  return sum;
#endif
}

// SIMD array sum for float64
double SIMDOptimizer::SumArray_SIMD(const double* data, size_t length) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 4) {
    // Scalar fallback
    double sum = 0.0;
    for (size_t i = 0; i < length; ++i) {
      sum += data[i];
    }
    return sum;
  }

  const size_t simd_width = 4;
  const size_t simd_iterations = length / simd_width;

  __m256d sum_vec = _mm256_setzero_pd();

  // Process 4 doubles at a time
  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256d data_vec = _mm256_loadu_pd(&data[i * simd_width]);
    sum_vec = _mm256_add_pd(sum_vec, data_vec);
  }

  // Horizontal sum
  __m128d sum128 = _mm_add_pd(_mm256_extractf128_pd(sum_vec, 0), _mm256_extractf128_pd(sum_vec, 1));
  sum128 = _mm_hadd_pd(sum128, sum128);

  double sum = _mm_cvtsd_f64(sum128);

  // Handle remaining elements
  for (size_t i = simd_iterations * simd_width; i < length; ++i) {
    sum += data[i];
  }

  return sum;
#else
  double sum = 0.0;
  for (size_t i = 0; i < length; ++i) {
    sum += data[i];
  }
  return sum;
#endif
}

// SIMD array multiplication
void SIMDOptimizer::MultiplyArrays_SIMD(const float* a, const float* b, float* result, size_t length) {
#ifdef __x86_64__
  if (!HasAVX2() || length < 8) {
    // Scalar fallback
    for (size_t i = 0; i < length; ++i) {
      result[i] = a[i] * b[i];
    }
    return;
  }

  const size_t simd_width = 8;
  const size_t simd_iterations = length / simd_width;

  // Process 8 floats at a time
  for (size_t i = 0; i < simd_iterations; ++i) {
    __m256 a_vec = _mm256_loadu_ps(&a[i * simd_width]);
    __m256 b_vec = _mm256_loadu_ps(&b[i * simd_width]);
    __m256 result_vec = _mm256_mul_ps(a_vec, b_vec);
    _mm256_storeu_ps(&result[i * simd_width], result_vec);
  }

  // Handle remaining elements
  for (size_t i = simd_iterations * simd_width; i < length; ++i) {
    result[i] = a[i] * b[i];
  }
#else
  for (size_t i = 0; i < length; ++i) {
    result[i] = a[i] * b[i];
  }
#endif
}

// Float32 array sum
Napi::Value SIMDOptimizer::ArraySumFloat32(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  Napi::Buffer<float> buffer = info[0].As<Napi::Buffer<float>>();
  const float* data = buffer.Data();
  size_t length = buffer.Length();

  bool usedSIMD = HasAVX2() && length >= 8;
  float sum = SumArray_SIMD(data, length);

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  UpdateMetrics(length * sizeof(float), duration, usedSIMD);

  return Napi::Number::New(env, sum);
}

// Float64 array sum
Napi::Value SIMDOptimizer::ArraySumFloat64(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  Napi::Buffer<double> buffer = info[0].As<Napi::Buffer<double>>();
  const double* data = buffer.Data();
  size_t length = buffer.Length();

  bool usedSIMD = HasAVX2() && length >= 4;
  double sum = SumArray_SIMD(data, length);

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  UpdateMetrics(length * sizeof(double), duration, usedSIMD);

  return Napi::Number::New(env, sum);
}

// Array multiplication
Napi::Value SIMDOptimizer::ArrayMultiply(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsBuffer()) {
    Napi::TypeError::New(env, "Two buffers expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  Napi::Buffer<float> buffer1 = info[0].As<Napi::Buffer<float>>();
  Napi::Buffer<float> buffer2 = info[1].As<Napi::Buffer<float>>();

  size_t length = std::min(buffer1.Length(), buffer2.Length());
  Napi::Buffer<float> result = Napi::Buffer<float>::New(env, length);

  const float* data1 = buffer1.Data();
  const float* data2 = buffer2.Data();
  float* resultData = result.Data();

  bool usedSIMD = HasAVX2() && length >= 8;
  MultiplyArrays_SIMD(data1, data2, resultData, length);

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  UpdateMetrics(length * sizeof(float) * 3, duration, usedSIMD);

  return result;
}

// Get performance metrics
Napi::Value SIMDOptimizer::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::Object metrics = Napi::Object::New(env);
  metrics.Set("totalOperations", Napi::Number::New(env, SIMDMetrics::total_operations.load()));
  metrics.Set("simdOperations", Napi::Number::New(env, SIMDMetrics::simd_operations.load()));
  metrics.Set("totalBytesProcessed", Napi::Number::New(env, SIMDMetrics::total_bytes_processed.load()));
  metrics.Set("totalProcessingTimeUs", Napi::Number::New(env, SIMDMetrics::total_processing_time_us.load()));

  // Calculate derived metrics
  uint64_t total = SIMDMetrics::total_operations.load();
  uint64_t simd = SIMDMetrics::simd_operations.load();
  uint64_t timeUs = SIMDMetrics::total_processing_time_us.load();

  if (total > 0) {
    metrics.Set("simdUsagePercent", Napi::Number::New(env, static_cast<double>(simd) / total * 100.0));
    metrics.Set("avgProcessingTimeUs", Napi::Number::New(env, static_cast<double>(timeUs) / total));
  }

  return metrics;
}

// Get SIMD capabilities
Napi::Value SIMDOptimizer::GetCapabilities(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::Object caps = Napi::Object::New(env);
  caps.Set("hasSSE42", Napi::Boolean::New(env, HasSSE42()));
  caps.Set("hasAVX2", Napi::Boolean::New(env, HasAVX2()));
  caps.Set("supportsSIMDArrayOps", Napi::Boolean::New(env, HasAVX2()));

  return caps;
}

// Benchmark SIMD operations
Napi::Value SIMDOptimizer::Benchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Create test data
  const size_t testSize = 10000;
  std::vector<float> testData(testSize);
  for (size_t i = 0; i < testSize; ++i) {
    testData[i] = static_cast<float>(i % 100);
  }

  Napi::Object results = Napi::Object::New(env);

  // Benchmark array sum
  auto startTime = std::chrono::high_resolution_clock::now();

  const int iterations = 1000;
  for (int i = 0; i < iterations; ++i) {
    volatile float sum = SumArray_SIMD(testData.data(), testSize);
    (void)sum; // Prevent optimization
  }

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  double avgTimeUs = static_cast<double>(duration) / iterations;
  double throughputMBps = (static_cast<double>(testSize * sizeof(float)) / (1024 * 1024)) / (avgTimeUs / 1000000.0);

  results.Set("avgSumTimeUs", Napi::Number::New(env, avgTimeUs));
  results.Set("throughputMBps", Napi::Number::New(env, throughputMBps));
  results.Set("usedSIMD", Napi::Boolean::New(env, HasAVX2()));
  results.Set("testSize", Napi::Number::New(env, testSize));

  return results;
}

// Update metrics helper
void SIMDOptimizer::UpdateMetrics(size_t bytes, int64_t timeUs, bool usedSIMD) {
  SIMDMetrics::total_operations.fetch_add(1);
  SIMDMetrics::total_bytes_processed.fetch_add(bytes);
  SIMDMetrics::total_processing_time_us.fetch_add(timeUs);

  if (usedSIMD) {
    SIMDMetrics::simd_operations.fetch_add(1);
  }
}

} // namespace nexurejs
