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
 * StreamProcessor - High-performance stream processing
 *
 * Features:
 * - Efficient chunked data processing
 * - Support for transformations
 * - Buffer management with overflow protection
 * - Auto-flushing options
 * - Detailed performance metrics
 */
class StreamProcessor : public Napi::ObjectWrap<StreamProcessor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

    StreamProcessor(const Napi::CallbackInfo& info);
    ~StreamProcessor();

private:
    // Private methods
    Napi::Value ProcessData(const Napi::CallbackInfo& info);
    Napi::Value ProcessChunk(const Napi::CallbackInfo& info);
    Napi::Value Flush(const Napi::CallbackInfo& info);
    Napi::Value GetBufferSize(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
    Napi::Value SetOptions(const Napi::CallbackInfo& info);

    // Buffer management
    size_t chunkSize_;
    size_t maxBufferSize_;
    bool autoFlush_;
    uint32_t flushInterval_;
    std::vector<uint8_t> buffer_;
    std::mutex bufferMutex_;

    // Metrics
    std::atomic<uint64_t> totalBytesProcessed_;
    std::atomic<uint32_t> totalChunksProcessed_;
    std::atomic<uint64_t> totalProcessingTime_; // in microseconds
    std::atomic<uint32_t> maxProcessingTime_;   // in milliseconds
    std::atomic<uint32_t> totalFlushes_;
    std::atomic<uint32_t> bufferOverflows_;
    std::chrono::steady_clock::time_point lastFlushTime_;
};

} // namespace nexurejs
