#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/buffer.h>
#include <algorithm>
#include <stdexcept>
#include <cstring>
#include <sstream>
#include <iomanip>
#include <mutex>
#include "string_encoder.h"

namespace nexurejs {

// Forward declaration for the function that might not be visible yet
void RegisterComponent(const std::string& name, std::function<void()> cleanup);

// Initialize static constructor reference
Napi::FunctionReference StringEncoder::constructor;

/**
 * Initialize the StringEncoder class and add it to exports
 */
Napi::Object StringEncoder::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "StringEncoder", {
        InstanceMethod("base64Encode", &StringEncoder::Base64Encode),
        InstanceMethod("base64Decode", &StringEncoder::Base64Decode),
        InstanceMethod("urlEncode", &StringEncoder::UrlEncode),
        InstanceMethod("urlDecode", &StringEncoder::UrlDecode),
        InstanceMethod("htmlEncode", &StringEncoder::HtmlEncode),
        InstanceMethod("htmlDecode", &StringEncoder::HtmlDecode),
        InstanceMethod("getMetrics", &StringEncoder::GetMetrics),
        InstanceMethod("resetMetrics", &StringEncoder::ResetMetrics),
        InstanceMethod("setLogLevel", &StringEncoder::SetLogLevel),
        InstanceMethod("setLogFile", &StringEncoder::SetLogFile),
        StaticMethod("getInstance", &StringEncoder::GetInstance),
        StaticMethod("resetMetrics", &StringEncoder::ResetMetricsStatic)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("StringEncoder", func);

    // Register for cleanup with a lambda that does nothing specific
    RegisterComponent("StringEncoder", []() {
        // No specific cleanup needed for StringEncoder
    });

    return exports;
}

/**
 * Constructor - initialize metrics and logging
 */
StringEncoder::StringEncoder(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<StringEncoder>(info) {
    // Initialize metrics to zero
    metrics_.totalEncodingOperations = 0;
    metrics_.totalDecodingOperations = 0;
    metrics_.base64EncodingCount = 0;
    metrics_.base64DecodingCount = 0;
    metrics_.urlEncodingCount = 0;
    metrics_.urlDecodingCount = 0;
    metrics_.htmlEncodingCount = 0;
    metrics_.htmlDecodingCount = 0;
    metrics_.hexEncodingCount = 0;
    metrics_.hexDecodingCount = 0;
    metrics_.normalizationCount = 0;
    metrics_.caseConversionCount = 0;
    metrics_.totalProcessingTimeMs = 0;
    metrics_.totalBytesProcessed = 0;
    metrics_.errorCount = 0;
    metrics_.retryCount = 0;
    metrics_.recoveredErrorCount = 0;

    // Initialize logging
    logLevel_ = LogLevel::INFO;
    consoleLogging_ = true;

    // Set configuration
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object config = info[0].As<Napi::Object>();

        // Set log level if provided
        if (config.Has("logLevel") && config.Get("logLevel").IsNumber()) {
            int level = config.Get("logLevel").As<Napi::Number>().Int32Value();
            if (level >= 0 && level <= static_cast<int>(LogLevel::NONE)) {
                logLevel_ = static_cast<LogLevel>(level);
            }
        }

        // Set log file if provided
        if (config.Has("logFile") && config.Get("logFile").IsString()) {
            std::string logFilePath = config.Get("logFile").As<Napi::String>().Utf8Value();
            logFile_.open(logFilePath, std::ios::app);
            if (logFile_.is_open()) {
                logFilePath_ = logFilePath;
            }
        }

        // Set console logging if provided
        if (config.Has("consoleLogging") && config.Get("consoleLogging").IsBoolean()) {
            consoleLogging_ = config.Get("consoleLogging").As<Napi::Boolean>().Value();
        }

        // Set retry settings if provided
        if (config.Has("enableRetry") && config.Get("enableRetry").IsBoolean()) {
            enableRetry_ = config.Get("enableRetry").As<Napi::Boolean>().Value();
        }

        if (config.Has("maxRetries") && config.Get("maxRetries").IsNumber()) {
            maxRetries_ = config.Get("maxRetries").As<Napi::Number>().Uint32Value();
        }

        if (config.Has("retryDelayMs") && config.Get("retryDelayMs").IsNumber()) {
            retryDelayMs_ = config.Get("retryDelayMs").As<Napi::Number>().Uint32Value();
        }
    }

    // Mark as initialized
    initialized_ = true;

    logInfo("StringEncoder initialized");
}

/**
 * Destructor
 */
StringEncoder::~StringEncoder() {
    logInfo("StringEncoder shutting down");

    // Close log file if open
    std::unique_lock<std::mutex> lock(logMutex_);
    if (logFile_.is_open()) {
        logFile_.close();
    }
}

/**
 * Get the singleton instance
 */
Napi::Value StringEncoder::GetInstance(const Napi::CallbackInfo& info) {
    // Use thread_local to ensure one instance per thread
    static thread_local Napi::ObjectReference instance;

    if (instance.IsEmpty()) {
        Napi::Object obj = constructor.New({});
        instance = Napi::Persistent(obj);
    }

    return instance.Value();
}

/**
 * Reset metrics for the singleton instance
 */
Napi::Value StringEncoder::ResetMetricsStatic(const Napi::CallbackInfo& info) {
    // No need to use env here since we're not returning a value from this method directly

    // Get the singleton instance and call resetMetrics
    Napi::Object instance = GetInstance(info).As<Napi::Object>();
    StringEncoder* encoder = StringEncoder::Unwrap(instance);
    encoder->ResetMetrics(info);

    return info.Env().Undefined();
}

/**
 * Encode a string using Base64
 */
Napi::Value StringEncoder::Base64Encode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Validate arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw std::runtime_error("Base64Encode requires a string input");
        }

        std::string input = info[0].As<Napi::String>().Utf8Value();

        // Basic base64 table
        static const char* base64_chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        std::string result;
        result.reserve(((input.size() + 2) / 3) * 4); // Pre-allocate space

        size_t i = 0;
        int j = 0;
        unsigned char char_array_3[3];
        unsigned char char_array_4[4];

        while (i < input.length()) {
            char_array_3[j++] = input[i++];
            if (j == 3) {
                char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
                char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
                char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
                char_array_4[3] = char_array_3[2] & 0x3f;

                for (j = 0; j < 4; j++) {
                    result.push_back(base64_chars[char_array_4[j]]);
                }
                j = 0;
            }
        }

        if (j) {
            for (int k = j; k < 3; k++) {
                char_array_3[k] = '\0';
            }

            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);

            for (int k = 0; k < j + 1; k++) {
                result.push_back(base64_chars[char_array_4[k]]);
            }

            while (j++ < 3) {
                result.push_back('=');
            }
        }

        // Update metrics
        {
            std::lock_guard<std::mutex> lock(metricsMutex_);
            metrics_.totalEncodingOperations++;
            metrics_.base64EncodingCount++;
            metrics_.totalBytesProcessed += input.length();

            auto endTime = std::chrono::high_resolution_clock::now();
            metrics_.totalProcessingTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
                endTime - startTime).count();
        }

        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        return handleError(e, env, "Base64Encode");
    }
}

/**
 * Decode a Base64 string
 */
Napi::Value StringEncoder::Base64Decode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Validate arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw std::runtime_error("Base64Decode requires a string input");
        }

        std::string input = info[0].As<Napi::String>().Utf8Value();

        // Mapping from base64 characters to 6-bit values
        static const unsigned char b64_lookup[256] = {
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,  62, 255, 255, 255,  63,
            52,  53,  54,  55,  56,  57,  58,  59,  60,  61, 255, 255, 255, 255, 255, 255,
            255,   0,   1,   2,   3,   4,   5,   6,   7,   8,   9,  10,  11,  12,  13,  14,
            15,  16,  17,  18,  19,  20,  21,  22,  23,  24,  25, 255, 255, 255, 255, 255,
            255,  26,  27,  28,  29,  30,  31,  32,  33,  34,  35,  36,  37,  38,  39,  40,
            41,  42,  43,  44,  45,  46,  47,  48,  49,  50,  51, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255
        };

        std::string result;
        result.reserve(input.length() * 3 / 4); // Pre-allocate space

        size_t i = 0;
        int j = 0;
        unsigned char char_array_4[4], char_array_3[3];

        while (i < input.length() && input[i] != '=' && b64_lookup[(unsigned char)input[i]] != 255) {
            char_array_4[j++] = input[i++];
            if (j == 4) {
                for (j = 0; j < 4; j++) {
                    char_array_4[j] = b64_lookup[(unsigned char)char_array_4[j]];
                }

                char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
                char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
                char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

                for (j = 0; j < 3; j++) {
                    result.push_back(char_array_3[j]);
                }
                j = 0;
            }
        }

        if (j) {
            for (int k = j; k < 4; k++) {
                char_array_4[k] = 0;
            }

            for (int k = 0; k < 4; k++) {
                char_array_4[k] = b64_lookup[(unsigned char)char_array_4[k]];
            }

            char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
            char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
            char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

            for (int k = 0; k < j - 1; k++) {
                result.push_back(char_array_3[k]);
            }
        }

        // Update metrics
        {
            std::lock_guard<std::mutex> lock(metricsMutex_);
            metrics_.totalDecodingOperations++;
            metrics_.base64DecodingCount++;
            metrics_.totalBytesProcessed += input.length();

            auto endTime = std::chrono::high_resolution_clock::now();
            metrics_.totalProcessingTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
                endTime - startTime).count();
        }

        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        return handleError(e, env, "Base64Decode");
    }
}

/**
 * Encode a string for use in URLs
 */
Napi::Value StringEncoder::UrlEncode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Validate arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw std::runtime_error("UrlEncode requires a string input");
        }

        std::string input = info[0].As<Napi::String>().Utf8Value();
        std::string result;
        result.reserve(input.length() * 3); // Worst case scenario

        // Perform the encoding
        for (char c : input) {
            if (isUrlSafeChar(c)) {
                // Safe characters go as-is
                result.push_back(c);
            } else if (c == ' ') {
                // Space becomes '+'
                result.push_back('+');
            } else {
                // Everything else becomes %XX
                result.push_back('%');
                std::string hex = charToHex(c);
                result.push_back(hex[0]);
                result.push_back(hex[1]);
            }
        }

        // Update metrics
        {
            std::lock_guard<std::mutex> lock(metricsMutex_);
            metrics_.totalEncodingOperations++;
            metrics_.urlEncodingCount++;
            metrics_.totalBytesProcessed += input.length();

            auto endTime = std::chrono::high_resolution_clock::now();
            metrics_.totalProcessingTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
                endTime - startTime).count();
        }

        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        return handleError(e, env, "UrlEncode");
    }
}

/**
 * Decode a URL-encoded string
 */
Napi::Value StringEncoder::UrlDecode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Validate arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw std::runtime_error("UrlDecode requires a string input");
        }

        std::string input = info[0].As<Napi::String>().Utf8Value();
        std::string result;
        result.reserve(input.length()); // Maximum size needed

        // Perform the decoding
        for (size_t i = 0; i < input.length(); i++) {
            if (input[i] == '+') {
                // '+' becomes space
                result.push_back(' ');
            } else if (input[i] == '%' && i + 2 < input.length()) {
                // %XX becomes the character with hex value XX
                result.push_back(hexToChar(input[i+1], input[i+2]));
                i += 2;
            } else {
                // Everything else stays the same
                result.push_back(input[i]);
            }
        }

        // Update metrics
        {
            std::lock_guard<std::mutex> lock(metricsMutex_);
            metrics_.totalDecodingOperations++;
            metrics_.urlDecodingCount++;
            metrics_.totalBytesProcessed += input.length();

            auto endTime = std::chrono::high_resolution_clock::now();
            metrics_.totalProcessingTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
                endTime - startTime).count();
        }

        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        return handleError(e, env, "UrlDecode");
    }
}

/**
 * HTML encode a string (simple implementation)
 */
Napi::Value StringEncoder::HtmlEncode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Validate arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw std::runtime_error("HtmlEncode requires a string input");
        }

        std::string input = info[0].As<Napi::String>().Utf8Value();
        std::string result;
        result.reserve(input.length() * 2); // Approximate size

        // Simple HTML encoding
        for (char c : input) {
            switch (c) {
                case '&': result.append("&amp;"); break;
                case '<': result.append("&lt;"); break;
                case '>': result.append("&gt;"); break;
                case '"': result.append("&quot;"); break;
                case '\'': result.append("&#x27;"); break;
                case '/': result.append("&#x2F;"); break;
                default: result.push_back(c);
            }
        }

        // Update metrics
        {
            std::lock_guard<std::mutex> lock(metricsMutex_);
            metrics_.totalEncodingOperations++;
            metrics_.htmlEncodingCount++;
            metrics_.totalBytesProcessed += input.length();

            auto endTime = std::chrono::high_resolution_clock::now();
            metrics_.totalProcessingTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
                endTime - startTime).count();
        }

        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        return handleError(e, env, "HtmlEncode");
    }
}

/**
 * HTML decode a string (simple implementation)
 */
Napi::Value StringEncoder::HtmlDecode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Validate arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw std::runtime_error("HtmlDecode requires a string input");
        }

        std::string input = info[0].As<Napi::String>().Utf8Value();
        std::string result;
        result.reserve(input.length()); // Maximum size needed

        // Simple HTML decoding
        for (size_t i = 0; i < input.length(); i++) {
            if (input[i] == '&' && i + 3 < input.length()) {
                if (input.substr(i, 5) == "&amp;") {
                    result.push_back('&');
                    i += 4;
                } else if (input.substr(i, 4) == "&lt;") {
                    result.push_back('<');
                    i += 3;
                } else if (input.substr(i, 4) == "&gt;") {
                    result.push_back('>');
                    i += 3;
                } else if (i + 5 < input.length() && input.substr(i, 6) == "&quot;") {
                    result.push_back('"');
                    i += 5;
                } else if (i + 5 < input.length() && input.substr(i, 6) == "&#x27;") {
                    result.push_back('\'');
                    i += 5;
                } else if (i + 5 < input.length() && input.substr(i, 6) == "&#x2F;") {
                    result.push_back('/');
                    i += 5;
                } else {
                    result.push_back(input[i]);
                }
            } else {
                result.push_back(input[i]);
            }
        }

        // Update metrics
        {
            std::lock_guard<std::mutex> lock(metricsMutex_);
            metrics_.totalDecodingOperations++;
            metrics_.htmlDecodingCount++;
            metrics_.totalBytesProcessed += input.length();

            auto endTime = std::chrono::high_resolution_clock::now();
            metrics_.totalProcessingTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
                endTime - startTime).count();
        }

        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        return handleError(e, env, "HtmlDecode");
    }
}

/**
 * Get metrics for encoding/decoding operations
 */
Napi::Value StringEncoder::GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object metrics = Napi::Object::New(env);

    std::lock_guard<std::mutex> lock(metricsMutex_);
    metrics.Set("totalEncodeCount", Napi::Number::New(env, metrics_.totalEncodingOperations.load()));
    metrics.Set("totalDecodeCount", Napi::Number::New(env, metrics_.totalDecodingOperations.load()));
    metrics.Set("totalTimeMs", Napi::Number::New(env, metrics_.totalProcessingTimeMs.load()));

    if (info.Length() > 0 && info[0].IsBoolean() && info[0].As<Napi::Boolean>().Value()) {
        // Detailed metrics requested
        Napi::Object detailed = Napi::Object::New(env);
        detailed.Set("base64EncodeCount", Napi::Number::New(env, metrics_.base64EncodingCount.load()));
        detailed.Set("base64DecodeCount", Napi::Number::New(env, metrics_.base64DecodingCount.load()));
        detailed.Set("urlEncodeCount", Napi::Number::New(env, metrics_.urlEncodingCount.load()));
        detailed.Set("urlDecodeCount", Napi::Number::New(env, metrics_.urlDecodingCount.load()));
        detailed.Set("htmlEncodeCount", Napi::Number::New(env, metrics_.htmlEncodingCount.load()));
        detailed.Set("htmlDecodeCount", Napi::Number::New(env, metrics_.htmlDecodingCount.load()));
        detailed.Set("totalBytesProcessed", Napi::Number::New(env, metrics_.totalBytesProcessed.load()));
        metrics.Set("detailed", detailed);
    }

    return metrics;
}

/**
 * Reset all metrics
 */
Napi::Value StringEncoder::ResetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(metricsMutex_);
    metrics_.totalEncodingOperations = 0;
    metrics_.totalDecodingOperations = 0;
    metrics_.base64EncodingCount = 0;
    metrics_.base64DecodingCount = 0;
    metrics_.urlEncodingCount = 0;
    metrics_.urlDecodingCount = 0;
    metrics_.htmlEncodingCount = 0;
    metrics_.htmlDecodingCount = 0;
    metrics_.hexEncodingCount = 0;
    metrics_.hexDecodingCount = 0;
    metrics_.normalizationCount = 0;
    metrics_.caseConversionCount = 0;
    metrics_.totalProcessingTimeMs = 0;
    metrics_.totalBytesProcessed = 0;

    return env.Undefined();
}

/**
 * Helper: Check if a character is URL-safe
 */
bool StringEncoder::isUrlSafeChar(char c) {
    return (c >= 'A' && c <= 'Z') ||
           (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') ||
           c == '-' || c == '_' || c == '.' || c == '~';
}

/**
 * Helper: Convert a hex character pair to a char
 */
char StringEncoder::hexToChar(char first, char second) {
    char byte = 0;

    // First hex digit
    if (first >= '0' && first <= '9') {
        byte = (first - '0') << 4;
    } else if (first >= 'A' && first <= 'F') {
        byte = (first - 'A' + 10) << 4;
    } else if (first >= 'a' && first <= 'f') {
        byte = (first - 'a' + 10) << 4;
    }

    // Second hex digit
    if (second >= '0' && second <= '9') {
        byte |= (second - '0');
    } else if (second >= 'A' && second <= 'F') {
        byte |= (second - 'A' + 10);
    } else if (second >= 'a' && second <= 'f') {
        byte |= (second - 'a' + 10);
    }

    return byte;
}

/**
 * Helper: Convert a char to a hex string
 */
std::string StringEncoder::charToHex(char c) {
    char hex[3];
    // Using snprintf to avoid the sprintf deprecation warning
    snprintf(hex, sizeof(hex), "%02X", static_cast<unsigned char>(c));
    return std::string(hex);
}

/**
 * Get current timestamp for logging
 */
std::string StringEncoder::getCurrentTimestamp() {
    // Get current time point
    auto now = std::chrono::system_clock::now();
    auto nowMs = std::chrono::time_point_cast<std::chrono::milliseconds>(now);
    auto epoch = nowMs.time_since_epoch();
    auto value = std::chrono::duration_cast<std::chrono::milliseconds>(epoch);

    // Extract milliseconds part
    long milliseconds = value.count() % 1000;

    // Convert to time_t for formatting
    auto nowTimeT = std::chrono::system_clock::to_time_t(now);

    // Format the time
    std::stringstream ss;
    std::tm tm;

    #ifdef _WIN32
    localtime_s(&tm, &nowTimeT);
    #else
    localtime_r(&nowTimeT, &tm);
    #endif

    ss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
    ss << "." << std::setw(3) << std::setfill('0') << milliseconds;

    return ss.str();
}

/**
 * Convert LogLevel to string
 */
std::string StringEncoder::logLevelToString(LogLevel level) {
    switch (level) {
        case LogLevel::TRACE:
            return "TRACE";
        case LogLevel::DEBUG:
            return "DEBUG";
        case LogLevel::INFO:
            return "INFO";
        case LogLevel::WARN:
            return "WARN";
        case LogLevel::ERROR:
            return "ERROR";
        case LogLevel::NONE:
            return "NONE";
        default:
            return "UNKNOWN";
    }
}

/**
 * Log a message at the specified level
 */
void StringEncoder::log(LogLevel level, const std::string& message) {
    // Skip if log level is too low
    if (level < logLevel_) {
        return;
    }

    // Format log entry
    std::string timestamp = getCurrentTimestamp();
    std::string levelStr = logLevelToString(level);
    std::string logEntry = timestamp + " [" + levelStr + "] StringEncoder: " + message;

    // Log to file if configured
    {
        std::unique_lock<std::mutex> lock(logMutex_);
        if (logFile_.is_open()) {
            logFile_ << logEntry << std::endl;
            logFile_.flush();
        }
    }

    // Log to console if enabled
    if (consoleLogging_) {
        switch (level) {
            case LogLevel::ERROR:
                std::cerr << logEntry << std::endl;
                break;
            case LogLevel::WARN:
                std::cerr << logEntry << std::endl;
                break;
            default:
                std::cout << logEntry << std::endl;
                break;
        }
    }
}

/**
 * Log at TRACE level
 */
void StringEncoder::logTrace(const std::string& message) {
    log(LogLevel::TRACE, message);
}

/**
 * Log at DEBUG level
 */
void StringEncoder::logDebug(const std::string& message) {
    log(LogLevel::DEBUG, message);
}

/**
 * Log at INFO level
 */
void StringEncoder::logInfo(const std::string& message) {
    log(LogLevel::INFO, message);
}

/**
 * Log at WARN level
 */
void StringEncoder::logWarn(const std::string& message) {
    log(LogLevel::WARN, message);
}

/**
 * Log at ERROR level
 */
void StringEncoder::logError(const std::string& message) {
    log(LogLevel::ERROR, message);
}

/**
 * Set log level
 */
Napi::Value StringEncoder::SetLogLevel(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Log level must be a number").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    int level = info[0].As<Napi::Number>().Int32Value();
    if (level < 0 || level > static_cast<int>(LogLevel::NONE)) {
        Napi::RangeError::New(env, "Log level must be between 0 and 5").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    logLevel_ = static_cast<LogLevel>(level);
    logInfo("Log level set to " + logLevelToString(logLevel_));

    return Napi::Number::New(env, static_cast<int>(logLevel_));
}

/**
 * Set log file
 */
Napi::Value StringEncoder::SetLogFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Log file path must be a string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string filePath = info[0].As<Napi::String>().Utf8Value();

    // Close existing log file if open
    {
        std::unique_lock<std::mutex> lock(logMutex_);
        if (logFile_.is_open()) {
            logFile_.close();
        }

        // Open new log file
        logFile_.open(filePath, std::ios::app);
        if (!logFile_.is_open()) {
            Napi::Error::New(env, "Failed to open log file: " + filePath).ThrowAsJavaScriptException();
            return env.Undefined();
        }

        logFilePath_ = filePath;
    }

    // Set console logging based on second parameter (default: true)
    if (info.Length() > 1 && info[1].IsBoolean()) {
        consoleLogging_ = info[1].As<Napi::Boolean>().Value();
    }

    logInfo("Logging to file: " + filePath + " (console logging: " +
            (consoleLogging_ ? "enabled" : "disabled") + ")");

    return Napi::String::New(env, logFilePath_);
}

/**
 * Classify error type from error message
 */
StringEncoder::ErrorType StringEncoder::classifyError(const std::string& errorMessage) {
    // Check for input validation errors
    if (errorMessage.find("requires a string input") != std::string::npos ||
        errorMessage.find("Invalid input") != std::string::npos ||
        errorMessage.find("argument") != std::string::npos) {
        return ErrorType::INPUT_ERROR;
    }

    // Check for encoding/decoding errors
    if (errorMessage.find("decode") != std::string::npos ||
        errorMessage.find("encode") != std::string::npos ||
        errorMessage.find("base64") != std::string::npos ||
        errorMessage.find("base-64") != std::string::npos ||
        errorMessage.find("url") != std::string::npos ||
        errorMessage.find("html") != std::string::npos ||
        errorMessage.find("format") != std::string::npos) {
        return ErrorType::ENCODING_ERROR;
    }

    // Check for memory errors
    if (errorMessage.find("memory") != std::string::npos ||
        errorMessage.find("allocation") != std::string::npos ||
        errorMessage.find("buffer") != std::string::npos ||
        errorMessage.find("overflow") != std::string::npos) {
        return ErrorType::MEMORY_ERROR;
    }

    // Default to unknown error
    return ErrorType::UNKNOWN_ERROR;
}

/**
 * Determine if an error is retryable
 */
bool StringEncoder::isRetryableError(ErrorType errorType) {
    switch (errorType) {
        case ErrorType::MEMORY_ERROR:
        case ErrorType::UNKNOWN_ERROR:
            return true;
        case ErrorType::ENCODING_ERROR:
            // Sometimes encoding errors can be transient
            return true;
        case ErrorType::INPUT_ERROR:
            // Input errors are not retryable - they need to be fixed at the source
            return false;
        default:
            return false;
    }
}

/**
 * Handle an error with proper logging and potential retry
 */
Napi::Value StringEncoder::handleError(const std::exception& e, const Napi::Env& env,
                                       const std::string& operation) {
    std::string errorMsg = e.what();
    logError("Error during " + operation + ": " + errorMsg);

    // Update metrics
    {
        std::lock_guard<std::mutex> lock(metricsMutex_);
        metrics_.errorCount++;
    }

    // Create error object with additional details
    Napi::Error error = Napi::Error::New(env, errorMsg);
    Napi::Object errorObj = error.Value().As<Napi::Object>();
    errorObj.Set("operation", Napi::String::New(env, operation));
    errorObj.Set("timestamp", Napi::String::New(env, getCurrentTimestamp()));

    // Classify error for potential retry
    ErrorType errorType = classifyError(errorMsg);
    bool retryable = isRetryableError(errorType);

    // Convert error type to string for the JS error object
    std::string errorTypeStr = std::to_string(static_cast<int>(errorType));
    errorObj.Set("errorType", Napi::String::New(env, errorTypeStr));
    errorObj.Set("retryable", Napi::Boolean::New(env, retryable));

    return error.Value();
}

} // namespace nexurejs
