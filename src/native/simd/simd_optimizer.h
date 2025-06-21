#ifndef SIMD_OPTIMIZER_H
#define SIMD_OPTIMIZER_H

#include <napi.h>
#include <atomic>
#include <chrono>

class SIMDOptimizer {
public:
  // Initialization
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Constructor
  SIMDOptimizer(const Napi::CallbackInfo& info);

  // Static methods for N-API binding
  static Napi::Value ArraySumFloat32(const Napi::CallbackInfo& info);
  static Napi::Value ArraySumFloat64(const Napi::CallbackInfo& info);
  static Napi::Value ArraySumInt32(const Napi::CallbackInfo& info);
  static Napi::Value ArrayMultiply(const Napi::CallbackInfo& info);
  static Napi::Value ArrayMultiplyFloat64(const Napi::CallbackInfo& info);
  static Napi::Value ArrayDotProduct(const Napi::CallbackInfo& info);
  static Napi::Value ArrayConvolve(const Napi::CallbackInfo& info);
  static Napi::Value FastMemcpy(const Napi::CallbackInfo& info);
  static Napi::Value FastMemset(const Napi::CallbackInfo& info);
  static Napi::Value StringSearch(const Napi::CallbackInfo& info);
  static Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  static Napi::Value GetCapabilities(const Napi::CallbackInfo& info);

private:
  // SIMD capability detection
  static bool HasSSE42();
  static bool HasAVX2();

  // Core SIMD operations
  static float SumArray_AVX2_Float32(const float* data, size_t length);
  static double SumArray_AVX2_Float64(const double* data, size_t length);
  static int32_t SumArray_AVX2_Int32(const int32_t* data, size_t length);
  static void MultiplyArray_AVX2_Float32(const float* a, const float* b, float* result, size_t length);
  static void MultiplyArray_AVX2_Float64(const double* a, const double* b, double* result, size_t length);

  // Advanced SIMD operations
  static float DotProduct_AVX2_Float32(const float* a, const float* b, size_t length);
  static double DotProduct_AVX2_Float64(const double* a, const double* b, size_t length);
  static void Convolution_AVX2_Float32(const float* signal, size_t signalLength,
                                     const float* kernel, size_t kernelLength,
                                     float* result);

  // Memory operations
  static size_t StringSearch_SIMD(const char* haystack, size_t haystackLen,
                                 const char* needle, size_t needleLen);

  // Performance tracking
  static void UpdateMetrics(size_t bytes_processed, int64_t execution_time_us, bool used_simd);

  // Performance metrics (static for thread safety)
  static std::atomic<uint64_t> total_operations_;
  static std::atomic<uint64_t> simd_operations_;
  static std::atomic<uint64_t> total_bytes_processed_;
  static std::atomic<uint64_t> total_execution_time_us_;
  static std::atomic<uint64_t> simd_bytes_processed_;
  static std::atomic<uint64_t> simd_execution_time_us_;
};

#endif // SIMD_OPTIMIZER_H
