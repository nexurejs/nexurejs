#ifndef NEXUREJS_STRING_ENCODER_H
#define NEXUREJS_STRING_ENCODER_H

#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <atomic>
#include <mutex>
#include <optional>
#include <fstream>
#include <iostream>
#include <chrono>
#include <iomanip>

namespace nexurejs {

/**
 * StringEncoder - High-performance string encoding/decoding utilities
 *
 * Features:
 * - Base64 encoding/decoding
 * - URL encoding/decoding
 * - HTML encoding/decoding
 * - Unicode normalization
 * - Case conversion
 * - Performance metrics tracking
 * - Comprehensive logging
 * - Error recovery mechanisms
 */
class StringEncoder : public Napi::ObjectWrap<StringEncoder> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    StringEncoder(const Napi::CallbackInfo& info);
    ~StringEncoder();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

    // Log level enumeration
    enum class LogLevel {
        TRACE = 0,
        DEBUG = 1,
        INFO = 2,
        WARN = 3,
        ERROR = 4,
        NONE = 5
    };

private:
    // Helper class for handling promises with proper initialization checks
    class EncoderPromise {
    private:
        std::optional<Napi::Env> env_;
        std::optional<Napi::Promise::Deferred> deferred_;
        bool initialized_ = false;

    public:
        // Default constructor - required for containers
        EncoderPromise() : initialized_(false) {}

        // Regular constructor
        EncoderPromise(Napi::Env e) : initialized_(true) {
            env_ = e;
            deferred_ = Napi::Promise::Deferred::New(e);
        }

        void Resolve(const Napi::Value& value) const {
            if (initialized_ && deferred_.has_value()) {
                deferred_->Resolve(value);
            }
        }

        void Reject(const Napi::Value& value) const {
            if (initialized_ && deferred_.has_value()) {
                deferred_->Reject(value);
            }
        }

        Napi::Promise GetPromise() const {
            if (initialized_ && deferred_.has_value()) {
                return deferred_->Promise();
            }
            throw std::runtime_error("Attempting to get promise from uninitialized EncoderPromise");
        }

        Napi::Env GetEnv() const {
            if (initialized_ && env_.has_value()) {
                return env_.value();
            }
            throw std::runtime_error("Attempting to get env from uninitialized EncoderPromise");
        }

        bool IsInitialized() const {
            return initialized_;
        }
    };

    // Encoding types
    enum class EncodingType {
        BASE64,
        URL,
        HTML,
        HEX
    };

    // Normalization form
    enum class NormForm {
        NFC,
        NFD,
        NFKC,
        NFKD
    };

    // Error types for recovery
    enum class ErrorType {
        INPUT_ERROR,      // Invalid input format or content
        ENCODING_ERROR,   // Error during encoding/decoding
        MEMORY_ERROR,     // Out of memory or buffer issues
        UNKNOWN_ERROR     // Unclassifiable error
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> totalEncodingOperations{0};
        std::atomic<uint64_t> totalDecodingOperations{0};
        std::atomic<uint64_t> base64EncodingCount{0};
        std::atomic<uint64_t> base64DecodingCount{0};
        std::atomic<uint64_t> urlEncodingCount{0};
        std::atomic<uint64_t> urlDecodingCount{0};
        std::atomic<uint64_t> htmlEncodingCount{0};
        std::atomic<uint64_t> htmlDecodingCount{0};
        std::atomic<uint64_t> hexEncodingCount{0};
        std::atomic<uint64_t> hexDecodingCount{0};
        std::atomic<uint64_t> normalizationCount{0};
        std::atomic<uint64_t> caseConversionCount{0};
        std::atomic<uint64_t> totalProcessingTimeMs{0};
        std::atomic<uint64_t> totalBytesProcessed{0};
        std::atomic<uint64_t> errorCount{0};
        std::atomic<uint64_t> retryCount{0};
        std::atomic<uint64_t> recoveredErrorCount{0};
    };

    // Public JS methods
    Napi::Value Base64Encode(const Napi::CallbackInfo& info);
    Napi::Value Base64Decode(const Napi::CallbackInfo& info);
    Napi::Value UrlEncode(const Napi::CallbackInfo& info);
    Napi::Value UrlDecode(const Napi::CallbackInfo& info);
    Napi::Value HtmlEncode(const Napi::CallbackInfo& info);
    Napi::Value HtmlDecode(const Napi::CallbackInfo& info);
    Napi::Value Encode(const Napi::CallbackInfo& info);
    Napi::Value Decode(const Napi::CallbackInfo& info);
    Napi::Value Normalize(const Napi::CallbackInfo& info);
    Napi::Value ToUpperCase(const Napi::CallbackInfo& info);
    Napi::Value ToLowerCase(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
    Napi::Value SetLogLevel(const Napi::CallbackInfo& info);
    Napi::Value SetLogFile(const Napi::CallbackInfo& info);

    // Internal methods
    std::string encodeString(const std::string& input, EncodingType type);
    std::string decodeString(const std::string& input, EncodingType type);
    std::string normalizeString(const std::string& input, NormForm form);
    std::string getEncodingName(EncodingType type);
    EncodingType getEncodingTypeFromString(const std::string& type);
    NormForm getNormFormFromString(const std::string& form);
    bool isUrlSafeChar(char c);
    char hexToChar(char first, char second);
    std::string charToHex(char c);

    // Error handling methods
    ErrorType classifyError(const std::string& errorMessage);
    bool isRetryableError(ErrorType errorType);
    Napi::Value handleError(const std::exception& e, const Napi::Env& env, const std::string& operation);

    // Logging methods
    std::string getCurrentTimestamp();
    std::string logLevelToString(LogLevel level);
    void log(LogLevel level, const std::string& message);
    void logTrace(const std::string& message);
    void logDebug(const std::string& message);
    void logInfo(const std::string& message);
    void logWarn(const std::string& message);
    void logError(const std::string& message);

    // Member variables
    Metrics metrics_;
    std::mutex metricsMutex_;

    // Logging variables
    LogLevel logLevel_ = LogLevel::INFO;
    std::string logFilePath_;
    std::mutex logMutex_;
    std::ofstream logFile_;
    bool consoleLogging_ = true;
    bool initialized_ = false;

    // Configuration
    bool enableRetry_ = true;
    uint32_t maxRetries_ = 3;
    uint32_t retryDelayMs_ = 50;
};

} // namespace nexurejs

#endif // NEXUREJS_STRING_ENCODER_H
