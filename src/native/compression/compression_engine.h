#pragma once

#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <atomic>
#include <mutex>
#include <map>

namespace nexurejs {

/**
 * CompressionEngine - Advanced compression algorithms
 *
 * Features:
 * - Multiple compression algorithms (gzip, deflate, brotli, lz4)
 * - Compression level control
 * - Dictionary-based compression
 * - Efficient memory management
 * - Detailed performance metrics
 */
class CompressionEngine : public Napi::ObjectWrap<CompressionEngine> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

    CompressionEngine(const Napi::CallbackInfo& info);
    ~CompressionEngine();

private:
    // Compression method handlers
    Napi::Value Compress(const Napi::CallbackInfo& info);
    Napi::Value Decompress(const Napi::CallbackInfo& info);
    Napi::Value CompressWithDictionary(const Napi::CallbackInfo& info);
    Napi::Value DecompressWithDictionary(const Napi::CallbackInfo& info);
    Napi::Value CreateDictionary(const Napi::CallbackInfo& info);
    Napi::Value SetAlgorithm(const Napi::CallbackInfo& info);
    Napi::Value SetCompressionLevel(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Utility methods
    void* CompressData(const void* data, size_t dataSize, size_t& compressedSize, const void* dictionary = nullptr, size_t dictSize = 0);
    void* DecompressData(const void* data, size_t dataSize, size_t& decompressedSize, const void* dictionary = nullptr, size_t dictSize = 0);

    // Internal state
    std::string algorithm_;
    int compressionLevel_;
    std::map<std::string, std::vector<uint8_t>> dictionaries_;
    std::mutex dictMutex_;

    // Metrics
    std::atomic<uint64_t> totalBytesCompressed_;
    std::atomic<uint64_t> totalBytesDecompressed_;
    std::atomic<uint64_t> totalBytesOriginal_;
    std::atomic<uint64_t> totalCompressTime_;    // in microseconds
    std::atomic<uint64_t> totalDecompressTime_;  // in microseconds
    std::atomic<uint32_t> compressOperations_;
    std::atomic<uint32_t> decompressOperations_;
};

} // namespace nexurejs
