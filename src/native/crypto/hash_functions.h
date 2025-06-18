#ifndef NEXUREJS_HASH_FUNCTIONS_H
#define NEXUREJS_HASH_FUNCTIONS_H

#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <atomic>
#include <mutex>

namespace nexurejs {

/**
 * HashFunctions - High-performance cryptographic hash implementations
 *
 * Features:
 * - Various hash algorithms (MD5, SHA1, SHA256, SHA512, etc.)
 * - HMAC support for all algorithms
 * - Streaming API for large data
 * - Performance metrics tracking
 */
class HashFunctions : public Napi::ObjectWrap<HashFunctions> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    HashFunctions(const Napi::CallbackInfo& info);
    ~HashFunctions();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
    // Hash algorithm enum
    enum class Algorithm {
        MD5,
        SHA1,
        SHA256,
        SHA384,
        SHA512
    };

    // Hash context for streaming API
    struct HashContext {
        Algorithm algorithm;
        void* context;         // Implementation-specific context
        bool finalized;
        std::vector<uint8_t> result;
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> totalHashes{0};
        std::atomic<uint64_t> md5Count{0};
        std::atomic<uint64_t> sha1Count{0};
        std::atomic<uint64_t> sha256Count{0};
        std::atomic<uint64_t> sha384Count{0};
        std::atomic<uint64_t> sha512Count{0};
        std::atomic<uint64_t> hmacCount{0};
        std::atomic<uint64_t> streamingCount{0};
        std::atomic<uint64_t> totalHashingTimeMs{0};
        std::atomic<uint64_t> totalBytesHashed{0};
    };

    // Public JS methods
    Napi::Value Hash(const Napi::CallbackInfo& info);
    Napi::Value Hmac(const Napi::CallbackInfo& info);
    Napi::Value CreateHashContext(const Napi::CallbackInfo& info);
    Napi::Value UpdateHashContext(const Napi::CallbackInfo& info);
    Napi::Value FinalizeHashContext(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Internal methods
    std::vector<uint8_t> computeHash(Algorithm algo, const std::vector<uint8_t>& data);
    std::vector<uint8_t> computeHmac(Algorithm algo, const std::vector<uint8_t>& data, const std::vector<uint8_t>& key);
    std::string getAlgorithmName(Algorithm algo);
    Algorithm getAlgorithmFromString(const std::string& algo);

    // Member variables
    std::vector<std::shared_ptr<HashContext>> contexts_;
    std::mutex contextMutex_;
    Metrics metrics_;
};

} // namespace nexurejs

#endif // NEXUREJS_HASH_FUNCTIONS_H
