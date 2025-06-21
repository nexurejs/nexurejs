#ifndef COMPRESSION_ENGINE_H
#define COMPRESSION_ENGINE_H

#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <atomic>
#include <mutex>
#include <map>
#include <cstdint>
#include <zlib.h>
#include <unordered_map>

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
    static Napi::FunctionReference constructor;

    CompressionEngine(const Napi::CallbackInfo& info);
    ~CompressionEngine();

    // Compression algorithms
    enum class CompressionAlgorithm {
        LZ77 = 0,
        RLE = 1,
        DELTA = 2
    };

    // Public API methods
    Napi::Value Compress(const Napi::CallbackInfo& info);
    Napi::Value Decompress(const Napi::CallbackInfo& info);
    Napi::Value CompressStream(const Napi::CallbackInfo& info);
    Napi::Value DecompressStream(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value GetCapabilities(const Napi::CallbackInfo& info);
    Napi::Value OptimizeForData(const Napi::CallbackInfo& info);



private:
    enum CompressionType {
        DEFLATE = 0,
        GZIP = 1,
        BROTLI = 2,
        ZLIB = 3
    };

    struct CompressionMetrics {
        std::atomic<uint64_t> totalCompressionTime{0};
        std::atomic<uint64_t> totalDecompressionTime{0};
        std::atomic<uint64_t> totalBytesCompressed{0};
        std::atomic<uint64_t> totalBytesDecompressed{0};
        std::atomic<uint64_t> totalCompressedSize{0};
        std::atomic<uint64_t> totalDecompressedSize{0};
        std::atomic<uint64_t> compressionCount{0};
        std::atomic<uint64_t> decompressionCount{0};
        std::atomic<uint64_t> compressionErrors{0};
        std::atomic<uint64_t> decompressionErrors{0};
        std::atomic<uint64_t> simdOptimizations{0};
        std::atomic<uint64_t> patternDetections{0};
    };

    // Internal implementation methods
    Napi::Buffer<uint8_t> CompressDeflate(Napi::Env env, const uint8_t* data, size_t length, int level);
    Napi::Buffer<uint8_t> DecompressDeflate(Napi::Env env, const uint8_t* data, size_t length);
    Napi::Buffer<uint8_t> CompressGzip(Napi::Env env, const uint8_t* data, size_t length, int level);
    Napi::Buffer<uint8_t> DecompressGzip(Napi::Env env, const uint8_t* data, size_t length);
    Napi::Buffer<uint8_t> CompressZlib(Napi::Env env, const uint8_t* data, size_t length, int level);
    Napi::Buffer<uint8_t> DecompressZlib(Napi::Env env, const uint8_t* data, size_t length);

    // For Brotli implementation, we would include the brotli headers and implement these methods
    Napi::Buffer<uint8_t> CompressBrotli(Napi::Env env, const uint8_t* data, size_t length, int quality);
    Napi::Buffer<uint8_t> DecompressBrotli(Napi::Env env, const uint8_t* data, size_t length);

    // Utilities
    void UpdateCompressionMetrics(uint64_t originalSize, uint64_t compressedSize, uint64_t duration, bool usedSIMD = false);
    void UpdateDecompressionMetrics(uint64_t compressedSize, uint64_t decompressedSize, uint64_t duration);
    void IncrementCompressionError();
    void IncrementDecompressionError();

    // SIMD capability detection
    static bool HasAVX2();
    static bool HasSSE42();

    // SIMD optimization methods
    bool AnalyzeDataPattern_SIMD(const uint8_t* data, size_t length,
                                bool& hasRepeatedPatterns, bool& isHighEntropy);
    void PreprocessData_SIMD(const uint8_t* input, uint8_t* output, size_t length);
    size_t FindRepeatedPatterns_SIMD(const uint8_t* data, size_t length);
    void OptimizeZlibParameters(z_stream& stream, const uint8_t* data, size_t length);

    // Fast memory operations
    void FastMemcpy_SIMD(uint8_t* dest, const uint8_t* src, size_t length);
    void FastMemset_SIMD(uint8_t* dest, int value, size_t length);

    // Member variables
    CompressionMetrics metrics;
    std::unordered_map<uint32_t, z_stream> zlibStreams;
    std::atomic<uint32_t> nextStreamId{1};
};

} // namespace nexurejs

#endif // COMPRESSION_ENGINE_H
