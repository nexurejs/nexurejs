#pragma once

#include <napi.h>
#include <string>
#include <map>
#include <unordered_map>
#include <atomic>
#include <mutex>
#include <chrono>

namespace nexurejs {

/**
 * RateLimiter - Token bucket rate limiting
 *
 * Features:
 * - Token bucket algorithm implementation
 * - Configurable rate limits and burst sizes
 * - IP-based and custom key rate limiting
 * - High precision timing
 * - Detailed performance metrics
 */
class RateLimiter : public Napi::ObjectWrap<RateLimiter> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);
    static Napi::FunctionReference constructor;

    RateLimiter(const Napi::CallbackInfo& info);
    ~RateLimiter();

private:
    struct Bucket {
        double tokens;
        std::chrono::steady_clock::time_point lastRefill;
        double tokensPerInterval;
        double interval; // in milliseconds
        double burstSize;

        Bucket() : tokens(0), lastRefill(std::chrono::steady_clock::now()),
                  tokensPerInterval(0), interval(0), burstSize(0) {}

        Bucket(double tpi, double intvl, double burst)
            : tokens(burst), lastRefill(std::chrono::steady_clock::now()),
              tokensPerInterval(tpi), interval(intvl), burstSize(burst) {}
    };

    // Public methods exposed to JavaScript
    Napi::Value TryAcquire(const Napi::CallbackInfo& info);
    Napi::Value TryAcquireForKey(const Napi::CallbackInfo& info);
    Napi::Value GetKeyStatus(const Napi::CallbackInfo& info);
    Napi::Value RemoveKey(const Napi::CallbackInfo& info);
    Napi::Value SetOptions(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Internal helper methods
    bool tryAcquireTokens(Bucket& bucket, double tokens);
    void refillTokens(Bucket& bucket);

    // Default parameters
    double tokensPerInterval_;
    double interval_; // in milliseconds
    double burstSize_;
    double precision_;

    // Storage for per-key rate limits
    std::mutex bucketsLock_;
    std::unordered_map<std::string, Bucket> buckets_;

    // Global default bucket
    Bucket defaultBucket_;

    // Metrics
    std::atomic<uint64_t> totalRequests_;
    std::atomic<uint64_t> allowedRequests_;
    std::atomic<uint64_t> throttledRequests_;
    std::atomic<uint64_t> totalWaitTime_; // in microseconds
    std::atomic<uint64_t> maxBurstUsed_;
};

} // namespace nexurejs
