#include "stream_processor.h"
#include <string>
#include <memory>
#include <mutex>
#include <chrono>
#include <algorithm>
#include <cstring>

#ifdef __x86_64__
#include <immintrin.h>
#elif defined(__aarch64__)
#include <arm_neon.h>
#endif

namespace nexurejs {

// Static member initialization
static Napi::FunctionReference constructor;

// SIMD-optimized memory operations
namespace SIMDOps {
    // Vectorized memory copy with SIMD
    void vectorizedMemcpy(void* dest, const void* src, size_t size) {
        const uint8_t* srcPtr = static_cast<const uint8_t*>(src);
        uint8_t* destPtr = static_cast<uint8_t*>(dest);

#ifdef __x86_64__
        // Use AVX2 for large copies
        if (size >= 32) {
            size_t vectorSize = size & ~31; // Round down to multiple of 32

            for (size_t i = 0; i < vectorSize; i += 32) {
                __m256i data = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(srcPtr + i));
                _mm256_storeu_si256(reinterpret_cast<__m256i*>(destPtr + i), data);
            }

            // Handle remaining bytes
            std::memcpy(destPtr + vectorSize, srcPtr + vectorSize, size - vectorSize);
            return;
        }
#elif defined(__aarch64__)
        // Use NEON for ARM64
        if (size >= 16) {
            size_t vectorSize = size & ~15; // Round down to multiple of 16

            for (size_t i = 0; i < vectorSize; i += 16) {
                uint8x16_t data = vld1q_u8(srcPtr + i);
                vst1q_u8(destPtr + i, data);
            }

            // Handle remaining bytes
            std::memcpy(destPtr + vectorSize, srcPtr + vectorSize, size - vectorSize);
            return;
        }
#endif

        // Fallback to standard memcpy
        std::memcpy(dest, src, size);
    }

    // Vectorized pattern search
    size_t findPattern(const uint8_t* data, size_t dataSize, const uint8_t* pattern, size_t patternSize) {
        if (patternSize == 0 || dataSize < patternSize) return SIZE_MAX;

#ifdef __x86_64__
        if (patternSize == 1) {
            // Optimized single-byte search with AVX2
            __m256i needle = _mm256_set1_epi8(pattern[0]);

            for (size_t i = 0; i <= dataSize - 32; i += 32) {
                __m256i haystack = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(data + i));
                __m256i cmp = _mm256_cmpeq_epi8(haystack, needle);
                uint32_t mask = _mm256_movemask_epi8(cmp);

                if (mask != 0) {
                    // Found potential match, check exact position
                    for (int j = 0; j < 32; j++) {
                        if (mask & (1 << j)) {
                            return i + j;
                        }
                    }
                }
            }
        }
#elif defined(__aarch64__)
        if (patternSize == 1) {
            // Optimized single-byte search with NEON
            uint8x16_t needle = vdupq_n_u8(pattern[0]);

            for (size_t i = 0; i <= dataSize - 16; i += 16) {
                uint8x16_t haystack = vld1q_u8(data + i);
                uint8x16_t cmp = vceqq_u8(haystack, needle);

                // Check if any byte matched
                uint64x2_t cmp64 = vreinterpretq_u64_u8(cmp);
                if (vgetq_lane_u64(cmp64, 0) != 0 || vgetq_lane_u64(cmp64, 1) != 0) {
                    // Found potential match, check exact position
                    uint8_t result[16];
                    vst1q_u8(result, cmp);
                    for (int j = 0; j < 16; j++) {
                        if (result[j] == 0xFF) {
                            return i + j;
                        }
                    }
                }
            }
        }
#endif

        // Fallback to standard search
        const uint8_t* result = static_cast<const uint8_t*>(memmem(data, dataSize, pattern, patternSize));
        return result ? (result - data) : SIZE_MAX;
    }

    // Vectorized checksum calculation
    uint32_t calculateChecksum(const uint8_t* data, size_t size) {
        uint32_t checksum = 0;

#ifdef __x86_64__
        // Use AVX2 for parallel accumulation
        __m256i sum = _mm256_setzero_si256();

        for (size_t i = 0; i <= size - 32; i += 32) {
            __m256i chunk = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(data + i));

            // Convert to 32-bit integers and accumulate
            __m256i lo = _mm256_unpacklo_epi8(chunk, _mm256_setzero_si256());
            __m256i hi = _mm256_unpackhi_epi8(chunk, _mm256_setzero_si256());

            __m256i lo32 = _mm256_unpacklo_epi16(lo, _mm256_setzero_si256());
            __m256i hi32 = _mm256_unpackhi_epi16(lo, _mm256_setzero_si256());

            sum = _mm256_add_epi32(sum, lo32);
            sum = _mm256_add_epi32(sum, hi32);
        }

        // Horizontal sum
        __m128i sum128 = _mm_add_epi32(_mm256_extracti128_si256(sum, 0), _mm256_extracti128_si256(sum, 1));
        sum128 = _mm_hadd_epi32(sum128, sum128);
        sum128 = _mm_hadd_epi32(sum128, sum128);
        checksum = _mm_extract_epi32(sum128, 0);

        // Handle remaining bytes
        for (size_t i = size & ~31; i < size; i++) {
            checksum += data[i];
        }

#elif defined(__aarch64__)
        // Use NEON for ARM64
        uint32x4_t sum = vdupq_n_u32(0);

        for (size_t i = 0; i <= size - 16; i += 16) {
            uint8x16_t chunk = vld1q_u8(data + i);

            // Convert to 32-bit and accumulate
            uint16x8_t lo = vmovl_u8(vget_low_u8(chunk));
            uint16x8_t hi = vmovl_u8(vget_high_u8(chunk));

            sum = vaddw_u16(sum, vget_low_u16(lo));
            sum = vaddw_u16(sum, vget_high_u16(lo));
            sum = vaddw_u16(sum, vget_low_u16(hi));
            sum = vaddw_u16(sum, vget_high_u16(hi));
        }

        // Horizontal sum
        checksum = vgetq_lane_u32(sum, 0) + vgetq_lane_u32(sum, 1) +
                   vgetq_lane_u32(sum, 2) + vgetq_lane_u32(sum, 3);

        // Handle remaining bytes
        for (size_t i = size & ~15; i < size; i++) {
            checksum += data[i];
        }
#else
        // Fallback implementation
        for (size_t i = 0; i < size; i++) {
            checksum += data[i];
        }
#endif

        return checksum;
    }
}

Napi::Object StreamProcessor::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "StreamProcessor", {
    InstanceMethod("processData", &StreamProcessor::ProcessData),
    InstanceMethod("processChunk", &StreamProcessor::ProcessChunk),
    InstanceMethod("processWithTransform", &StreamProcessor::ProcessWithTransform),
    InstanceMethod("findPattern", &StreamProcessor::FindPattern),
    InstanceMethod("calculateChecksum", &StreamProcessor::CalculateChecksum),
    InstanceMethod("flush", &StreamProcessor::Flush),
    InstanceMethod("getBufferSize", &StreamProcessor::GetBufferSize),
    InstanceMethod("getMetrics", &StreamProcessor::GetMetrics),
    InstanceMethod("resetMetrics", &StreamProcessor::ResetMetrics),
    InstanceMethod("setOptions", &StreamProcessor::SetOptions),
    StaticMethod("getInstance", &StreamProcessor::GetInstance),
    StaticMethod("resetMetrics", &StreamProcessor::ResetMetricsStatic),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("StreamProcessor", func);
  return exports;
}

StreamProcessor::StreamProcessor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<StreamProcessor>(info),
      chunkSize_(8192), // Increased default chunk size for better SIMD utilization
      maxBufferSize_(4 * 1024 * 1024), // 4MB default for better performance
      autoFlush_(true),
      flushInterval_(500), // Reduced flush interval for better responsiveness
      totalBytesProcessed_(0),
      totalChunksProcessed_(0),
      totalProcessingTime_(0),
      maxProcessingTime_(0),
      totalFlushes_(0),
      bufferOverflows_(0),
      simdOperations_(0),
      checksumOperations_(0),
      patternSearches_(0),
      lastFlushTime_(std::chrono::steady_clock::now()) {

    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Process options if provided
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object options = info[0].As<Napi::Object>();

        if (options.Has("chunkSize") && options.Get("chunkSize").IsNumber()) {
            chunkSize_ = options.Get("chunkSize").As<Napi::Number>().Uint32Value();
            // Ensure chunk size is SIMD-aligned
            chunkSize_ = (chunkSize_ + 31) & ~31; // Round up to 32-byte boundary
        }

        if (options.Has("maxBufferSize") && options.Get("maxBufferSize").IsNumber()) {
            maxBufferSize_ = options.Get("maxBufferSize").As<Napi::Number>().Uint32Value();
            // Ensure buffer size is SIMD-aligned
            maxBufferSize_ = (maxBufferSize_ + 31) & ~31;
        }

        if (options.Has("autoFlush") && options.Get("autoFlush").IsBoolean()) {
            autoFlush_ = options.Get("autoFlush").As<Napi::Boolean>().Value();
        }

        if (options.Has("flushInterval") && options.Get("flushInterval").IsNumber()) {
            flushInterval_ = options.Get("flushInterval").As<Napi::Number>().Uint32Value();
        }
    }

    // Initialize buffer with SIMD-aligned allocation
    buffer_.reserve(maxBufferSize_);

    // Pre-allocate working buffers for SIMD operations
    workingBuffer_.reserve(chunkSize_);
}

StreamProcessor::~StreamProcessor() {
    // Ensure any remaining data is flushed
    std::lock_guard<std::mutex> lock(bufferMutex_);
    buffer_.clear();
    workingBuffer_.clear();
}

Napi::Value StreamProcessor::GetInstance(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    return constructor.New({});
}

Napi::Value StreamProcessor::ResetMetricsStatic(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return env.Undefined();
}

Napi::Value StreamProcessor::ProcessData(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    bool forceFlush = false;

    if (info.Length() > 1 && info[1].IsBoolean()) {
        forceFlush = info[1].As<Napi::Boolean>().Value();
    }

    auto start = std::chrono::high_resolution_clock::now();

    // Process the data with SIMD optimizations
    size_t size = buffer.Length();
    size_t processedSize = 0;

    {
        std::lock_guard<std::mutex> lock(bufferMutex_);

        // Check if buffer would overflow
        if (buffer_.size() + size > maxBufferSize_) {
            bufferOverflows_++;

            if (autoFlush_) {
                // Perform internal flush logic
                buffer_.clear();
                totalFlushes_++;
            } else {
                // Truncate new data to fit
                size = maxBufferSize_ - buffer_.size();
            }
        }

        if (size > 0) {
            // Use SIMD-optimized memory copy
            size_t oldSize = buffer_.size();
            buffer_.resize(oldSize + size);
            SIMDOps::vectorizedMemcpy(buffer_.data() + oldSize, buffer.Data(), size);
            processedSize = size;
            simdOperations_++;
        }

        // Auto-flush check
        auto now = std::chrono::steady_clock::now();
        bool timeToFlush = autoFlush_ &&
            std::chrono::duration_cast<std::chrono::milliseconds>(now - lastFlushTime_).count() >= flushInterval_;

        if (forceFlush || timeToFlush) {
            buffer_.clear();
            lastFlushTime_ = now;
            totalFlushes_++;
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();

    // Update metrics
    totalBytesProcessed_ += processedSize;
    totalChunksProcessed_++;
    totalProcessingTime_ += duration / 1000; // Convert to microseconds

    uint32_t durationMs = static_cast<uint32_t>(duration / 1000000);
    uint32_t currentMax = maxProcessingTime_.load();
    while(durationMs > currentMax) {
        if (maxProcessingTime_.compare_exchange_weak(currentMax, durationMs)) {
            break;
        }
    }

    return Napi::Number::New(env, processedSize);
}

Napi::Value StreamProcessor::ProcessChunk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    auto start = std::chrono::high_resolution_clock::now();

    // Process in optimized chunks with SIMD alignment
    size_t totalProcessed = 0;
    size_t remaining = buffer.Length();
    const uint8_t* data = buffer.Data();

    while (remaining > 0) {
        size_t chunkSize = std::min(remaining, chunkSize_);

        // Align chunk size to SIMD boundaries for better performance
        if (chunkSize >= 32) {
            chunkSize = chunkSize & ~31; // Round down to 32-byte boundary
        }

        if (chunkSize == 0) chunkSize = std::min(remaining, static_cast<size_t>(32));

        // Process the chunk with SIMD operations
        {
            std::lock_guard<std::mutex> lock(bufferMutex_);

            // Check if buffer would overflow
            if (buffer_.size() + chunkSize > maxBufferSize_) {
                bufferOverflows_++;

                if (autoFlush_) {
                    buffer_.clear();
                    totalFlushes_++;
                } else {
                    chunkSize = maxBufferSize_ - buffer_.size();
                    if (chunkSize == 0) break;
                }
            }

            // Use SIMD-optimized memory operations
            size_t oldSize = buffer_.size();
            buffer_.resize(oldSize + chunkSize);
            SIMDOps::vectorizedMemcpy(buffer_.data() + oldSize, data, chunkSize);
            simdOperations_++;
        }

        // Update for next iteration
        data += chunkSize;
        remaining -= chunkSize;
        totalProcessed += chunkSize;
        totalChunksProcessed_++;
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();

    // Update metrics
    totalBytesProcessed_ += totalProcessed;
    totalProcessingTime_ += duration / 1000; // Convert to microseconds

    uint32_t durationMs = static_cast<uint32_t>(duration / 1000000);
    uint32_t currentMax = maxProcessingTime_.load();
    while(durationMs > currentMax) {
        if (maxProcessingTime_.compare_exchange_weak(currentMax, durationMs)) {
            break;
        }
    }

    return Napi::Number::New(env, totalProcessed);
}

Napi::Value StreamProcessor::ProcessWithTransform(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Buffer and transform function expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
    Napi::Function transform = info[1].As<Napi::Function>();

    auto start = std::chrono::high_resolution_clock::now();

    // Prepare working buffer
    size_t inputSize = inputBuffer.Length();
    workingBuffer_.clear();
    workingBuffer_.reserve(inputSize * 2); // Reserve extra space for potential expansion

    // Process in SIMD-aligned chunks
    const uint8_t* inputData = inputBuffer.Data();
    size_t processed = 0;

    while (processed < inputSize) {
        size_t chunkSize = std::min(inputSize - processed, chunkSize_);

        // Create a buffer for this chunk
        Napi::Buffer<uint8_t> chunkBuffer = Napi::Buffer<uint8_t>::New(env, chunkSize);
        SIMDOps::vectorizedMemcpy(chunkBuffer.Data(), inputData + processed, chunkSize);

        // Apply transform
        Napi::Value result = transform.Call({chunkBuffer});

        if (result.IsBuffer()) {
            Napi::Buffer<uint8_t> transformedChunk = result.As<Napi::Buffer<uint8_t>>();
            size_t transformedSize = transformedChunk.Length();

            // Add to working buffer
            size_t oldSize = workingBuffer_.size();
            workingBuffer_.resize(oldSize + transformedSize);
            SIMDOps::vectorizedMemcpy(workingBuffer_.data() + oldSize,
                                    transformedChunk.Data(), transformedSize);
        }

        processed += chunkSize;
        simdOperations_++;
    }

    // Move transformed data to main buffer
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);

        if (buffer_.size() + workingBuffer_.size() > maxBufferSize_) {
            bufferOverflows_++;
            if (autoFlush_) {
                buffer_.clear();
                totalFlushes_++;
            }
        }

        size_t oldSize = buffer_.size();
        size_t newDataSize = std::min(workingBuffer_.size(), maxBufferSize_ - oldSize);

        if (newDataSize > 0) {
            buffer_.resize(oldSize + newDataSize);
            SIMDOps::vectorizedMemcpy(buffer_.data() + oldSize,
                                    workingBuffer_.data(), newDataSize);
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();

    // Update metrics
    totalBytesProcessed_ += workingBuffer_.size();
    totalChunksProcessed_++;
    totalProcessingTime_ += duration / 1000;

    return Napi::Number::New(env, workingBuffer_.size());
}

Napi::Value StreamProcessor::FindPattern(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Pattern buffer expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> patternBuffer = info[0].As<Napi::Buffer<uint8_t>>();
    auto start = std::chrono::high_resolution_clock::now();

    size_t position = SIZE_MAX;
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);

        if (!buffer_.empty() && patternBuffer.Length() > 0) {
            position = SIMDOps::findPattern(buffer_.data(), buffer_.size(),
                                          patternBuffer.Data(), patternBuffer.Length());
            simdOperations_++;
            patternSearches_++;
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
    totalProcessingTime_ += duration / 1000;

    if (position == SIZE_MAX) {
        return env.Null();
    }

    return Napi::Number::New(env, position);
}

Napi::Value StreamProcessor::CalculateChecksum(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    auto start = std::chrono::high_resolution_clock::now();

    uint32_t checksum = 0;
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);

        if (!buffer_.empty()) {
            checksum = SIMDOps::calculateChecksum(buffer_.data(), buffer_.size());
            simdOperations_++;
            checksumOperations_++;
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
    totalProcessingTime_ += duration / 1000;

    return Napi::Number::New(env, checksum);
}

Napi::Value StreamProcessor::Flush(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    size_t flushedSize;
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);
        flushedSize = buffer_.size();
        buffer_.clear();
        lastFlushTime_ = std::chrono::steady_clock::now();
        totalFlushes_++;
    }

    return Napi::Number::New(env, flushedSize);
}

Napi::Value StreamProcessor::GetBufferSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    std::lock_guard<std::mutex> lock(bufferMutex_);
    return Napi::Number::New(env, buffer_.size());
}

Napi::Value StreamProcessor::GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    Napi::Object metrics = Napi::Object::New(env);

    // Performance metrics
    metrics.Set("totalBytesProcessed", Napi::Number::New(env, totalBytesProcessed_));
    metrics.Set("totalChunksProcessed", Napi::Number::New(env, totalChunksProcessed_));
    metrics.Set("totalProcessingTime", Napi::Number::New(env, totalProcessingTime_));
    metrics.Set("maxProcessingTime", Napi::Number::New(env, maxProcessingTime_));
    metrics.Set("totalFlushes", Napi::Number::New(env, totalFlushes_));
    metrics.Set("bufferOverflows", Napi::Number::New(env, bufferOverflows_));

    // SIMD-specific metrics
    metrics.Set("simdOperations", Napi::Number::New(env, simdOperations_));
    metrics.Set("checksumOperations", Napi::Number::New(env, checksumOperations_));
    metrics.Set("patternSearches", Napi::Number::New(env, patternSearches_));

    // Current state
    std::lock_guard<std::mutex> lock(bufferMutex_);
    metrics.Set("currentBufferSize", Napi::Number::New(env, buffer_.size()));
    metrics.Set("bufferUtilization", Napi::Number::New(env, (double)buffer_.size() / maxBufferSize_));

    // Performance calculations
    uint64_t totalBytes = totalBytesProcessed_.load();
    uint64_t totalTime = totalProcessingTime_.load();

    if (totalTime > 0) {
        double throughputMBps = (double)totalBytes / totalTime; // MB/s
        metrics.Set("throughputMBps", Napi::Number::New(env, throughputMBps));
    }

    if (totalBytes > 0) {
        double simdEfficiency = (double)simdOperations_.load() / totalChunksProcessed_.load() * 100.0;
        metrics.Set("simdEfficiencyPercent", Napi::Number::New(env, simdEfficiency));
    }

    return metrics;
}

Napi::Value StreamProcessor::ResetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    totalBytesProcessed_ = 0;
    totalChunksProcessed_ = 0;
    totalProcessingTime_ = 0;
    maxProcessingTime_ = 0;
    totalFlushes_ = 0;
    bufferOverflows_ = 0;
    simdOperations_ = 0;
    checksumOperations_ = 0;
    patternSearches_ = 0;

    return env.Undefined();
}

Napi::Value StreamProcessor::SetOptions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected for options").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object options = info[0].As<Napi::Object>();
    std::lock_guard<std::mutex> lock(bufferMutex_);

    if (options.Has("chunkSize") && options.Get("chunkSize").IsNumber()) {
        chunkSize_ = options.Get("chunkSize").As<Napi::Number>().Uint32Value();
        // Ensure SIMD alignment
        chunkSize_ = (chunkSize_ + 31) & ~31;
    }

    if (options.Has("maxBufferSize") && options.Get("maxBufferSize").IsNumber()) {
        size_t newMaxSize = options.Get("maxBufferSize").As<Napi::Number>().Uint32Value();
        newMaxSize = (newMaxSize + 31) & ~31; // SIMD alignment

        // If decreasing buffer size, make sure we're not above new max
        if (newMaxSize < maxBufferSize_ && buffer_.size() > newMaxSize) {
            buffer_.resize(newMaxSize);
        }

        maxBufferSize_ = newMaxSize;
        buffer_.reserve(maxBufferSize_);
    }

    if (options.Has("autoFlush") && options.Get("autoFlush").IsBoolean()) {
        autoFlush_ = options.Get("autoFlush").As<Napi::Boolean>().Value();
    }

    if (options.Has("flushInterval") && options.Get("flushInterval").IsNumber()) {
        flushInterval_ = options.Get("flushInterval").As<Napi::Number>().Uint32Value();
    }

    return env.Undefined();
}

} // namespace nexurejs
