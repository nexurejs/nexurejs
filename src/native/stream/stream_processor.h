#pragma once

#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <atomic>
#include <mutex>
#include <chrono>

namespace nexurejs {

/**
 * StreamProcessor - High-performance SIMD-optimized stream processing
 *
 * Features:
 * - SIMD-accelerated memory operations (AVX2/NEON)
 * - Vectorized pattern search and checksum calculation
 * - Efficient chunked data processing with SIMD alignment
 * - Transform support with optimized buffer management
 * - Advanced performance metrics and monitoring
 * - Buffer management with overflow protection
 * - Auto-flushing options with configurable intervals
 */
class StreamProcessor : public Napi::ObjectWrap<StreamProcessor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

    StreamProcessor(const Napi::CallbackInfo& info);
    ~StreamProcessor();

private:
    // Core processing methods
    Napi::Value ProcessData(const Napi::CallbackInfo& info);
    Napi::Value ProcessChunk(const Napi::CallbackInfo& info);
    Napi::Value ProcessWithTransform(const Napi::CallbackInfo& info);

    // SIMD-optimized operations
    Napi::Value FindPattern(const Napi::CallbackInfo& info);
    Napi::Value CalculateChecksum(const Napi::CallbackInfo& info);

    // Buffer management
    Napi::Value Flush(const Napi::CallbackInfo& info);
    Napi::Value GetBufferSize(const Napi::CallbackInfo& info);

    // Configuration and metrics
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
    Napi::Value SetOptions(const Napi::CallbackInfo& info);

    // Configuration
    size_t chunkSize_;          // SIMD-aligned chunk size
    size_t maxBufferSize_;      // SIMD-aligned maximum buffer size
    bool autoFlush_;            // Automatic flushing enabled
    uint32_t flushInterval_;    // Flush interval in milliseconds

    // Buffers (SIMD-aligned)
    std::vector<uint8_t> buffer_;        // Main processing buffer
    std::vector<uint8_t> workingBuffer_; // Working buffer for transforms
    std::mutex bufferMutex_;             // Thread safety for buffer operations

    // Performance metrics
    std::atomic<uint64_t> totalBytesProcessed_;  // Total bytes processed
    std::atomic<uint32_t> totalChunksProcessed_; // Total chunks processed
    std::atomic<uint64_t> totalProcessingTime_;  // Total processing time (microseconds)
    std::atomic<uint32_t> maxProcessingTime_;    // Maximum processing time (milliseconds)
    std::atomic<uint32_t> totalFlushes_;         // Total flush operations
    std::atomic<uint32_t> bufferOverflows_;      // Buffer overflow count

    // SIMD-specific metrics
    std::atomic<uint64_t> simdOperations_;       // SIMD operations performed
    std::atomic<uint32_t> checksumOperations_;   // Checksum calculations
    std::atomic<uint32_t> patternSearches_;      // Pattern search operations

    // Timing
    std::chrono::steady_clock::time_point lastFlushTime_;
};

} // namespace nexurejs
