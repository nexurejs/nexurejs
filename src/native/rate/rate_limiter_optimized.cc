#include "rate_limiter.h"
#include <cmath>
#include <algorithm>
#include <memory>

#ifdef __x86_64__
#include <immintrin.h>
#elif defined(__aarch64__)
#include <arm_neon.h>
#endif

namespace nexurejs {

// Static member initialization
Napi::FunctionReference RateLimiter::constructor;

// SIMD-optimized operations for rate limiting
namespace SIMDRateOps {
    // Vectorized token bucket updates for bulk operations
    void updateMultipleBuckets(double* tokens, const double* rates, const double* maxTokens,
                              double elapsed, size_t count) {
#ifdef __x86_64__
        if (count >= 4) {
            size_t vectorCount = count & ~3; // Round down to multiple of 4
            __m256d elapsedVec = _mm256_set1_pd(elapsed);

            for (size_t i = 0; i < vectorCount; i += 4) {
                __m256d currentTokens = _mm256_loadu_pd(&tokens[i]);
                __m256d tokenRates = _mm256_loadu_pd(&rates[i]);
                __m256d maxTokensVec = _mm256_loadu_pd(&maxTokens[i]);

                __m256d tokensToAdd = _mm256_mul_pd(elapsedVec, tokenRates);
                __m256d newTokens = _mm256_add_pd(currentTokens, tokensToAdd);
                newTokens = _mm256_min_pd(newTokens, maxTokensVec);

                _mm256_storeu_pd(&tokens[i], newTokens);
            }

            for (size_t i = vectorCount; i < count; i++) {
                double tokensToAdd = elapsed * rates[i];
                tokens[i] = std::min(tokens[i] + tokensToAdd, maxTokens[i]);
            }
            return;
        }
#elif defined(__aarch64__)
        if (count >= 2) {
            size_t vectorCount = count & ~1;
            float64x2_t elapsedVec = vdupq_n_f64(elapsed);

            for (size_t i = 0; i < vectorCount; i += 2) {
                float64x2_t currentTokens = vld1q_f64(&tokens[i]);
                float64x2_t tokenRates = vld1q_f64(&rates[i]);
                float64x2_t maxTokensVec = vld1q_f64(&maxTokens[i]);

                float64x2_t tokensToAdd = vmulq_f64(elapsedVec, tokenRates);
                float64x2_t newTokens = vaddq_f64(currentTokens, tokensToAdd);
                newTokens = vminq_f64(newTokens, maxTokensVec);

                vst1q_f64(&tokens[i], newTokens);
            }

            for (size_t i = vectorCount; i < count; i++) {
                double tokensToAdd = elapsed * rates[i];
                tokens[i] = std::min(tokens[i] + tokensToAdd, maxTokens[i]);
            }
            return;
        }
#endif

        // Fallback implementation
        for (size_t i = 0; i < count; i++) {
            double tokensToAdd = elapsed * rates[i];
            tokens[i] = std::min(tokens[i] + tokensToAdd, maxTokens[i]);
        }
    }

    // Fast hash function for string keys
    uint64_t fastHash(const char* data, size_t length) {
        uint64_t hash = 14695981039346656037ULL; // FNV offset basis
        const uint64_t prime = 1099511628211ULL;   // FNV prime

        for (size_t i = 0; i < length; i++) {
            hash ^= static_cast<uint64_t>(data[i]);
            hash *= prime;
        }

        return hash;
    }
}

Napi::Object RateLimiter::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "RateLimiter", {
        InstanceMethod("tryAcquire", &RateLimiter::TryAcquire),
        InstanceMethod("tryAcquireForKey", &RateLimiter::TryAcquireForKey),
        InstanceMethod("getKeyStatus", &RateLimiter::GetKeyStatus),
        InstanceMethod("removeKey", &RateLimiter::RemoveKey),
        InstanceMethod("setOptions", &RateLimiter::SetOptions),
        InstanceMethod("getMetrics", &RateLimiter::GetMetrics),
        InstanceMethod("resetMetrics", &RateLimiter::ResetMetrics),
        StaticMethod("getInstance", &RateLimiter::GetInstance),
        StaticMethod("resetMetrics", &RateLimiter::ResetMetricsStatic),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("RateLimiter", func);
    return exports;
}

RateLimiter::RateLimiter(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<RateLimiter>(info),
      tokensPerInterval_(100.0),
      interval_(1000.0),
      burstSize_(1000.0),
      precision_(0.001),
      totalRequests_(0),
      allowedRequests_(0),
      throttledRequests_(0),
      totalWaitTime_(0),
      maxBurstUsed_(0),
      defaultBucket_(100.0, 1000.0, 1000.0) {

    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object options = info[0].As<Napi::Object>();

        if (options.Has("tokensPerInterval") && options.Get("tokensPerInterval").IsNumber()) {
            tokensPerInterval_ = options.Get("tokensPerInterval").As<Napi::Number>().DoubleValue();
        }

        if (options.Has("interval") && options.Get("interval").IsNumber()) {
            interval_ = options.Get("interval").As<Napi::Number>().DoubleValue();
        }

        if (options.Has("burstSize") && options.Get("burstSize").IsNumber()) {
            burstSize_ = options.Get("burstSize").As<Napi::Number>().DoubleValue();
        }

        if (options.Has("precision") && options.Get("precision").IsNumber()) {
            precision_ = options.Get("precision").As<Napi::Number>().DoubleValue();
        }
    }

    defaultBucket_ = Bucket(tokensPerInterval_, interval_, burstSize_);
    buckets_.reserve(1000);
}

RateLimiter::~RateLimiter() {
    std::lock_guard<std::mutex> lock(bucketsLock_);
    buckets_.clear();
}

Napi::Value RateLimiter::GetInstance(const Napi::CallbackInfo& info) {
    return constructor.New({});
}

Napi::Value RateLimiter::ResetMetricsStatic(const Napi::CallbackInfo& info) {
    return info.Env().Undefined();
}

bool RateLimiter::tryAcquireTokens(Bucket& bucket, double tokens) {
    auto start = std::chrono::high_resolution_clock::now();

    refillTokens(bucket);

    bool success = false;
    if (bucket.tokens >= tokens) {
        bucket.tokens -= tokens;
        success = true;

        uint64_t burstUsed = static_cast<uint64_t>(bucket.burstSize - bucket.tokens);
        uint64_t currentMax = maxBurstUsed_.load();
        while (burstUsed > currentMax) {
            if (maxBurstUsed_.compare_exchange_weak(currentMax, burstUsed)) {
                break;
            }
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
    totalWaitTime_ += duration;

    return success;
}

void RateLimiter::refillTokens(Bucket& bucket) {
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration<double, std::milli>(now - bucket.lastRefill).count();

    if (elapsed >= precision_) {
        double tokensToAdd = (elapsed / bucket.interval) * bucket.tokensPerInterval;
        bucket.tokens = std::min(bucket.tokens + tokensToAdd, bucket.burstSize);
        bucket.lastRefill = now;
    }
}

Napi::Value RateLimiter::TryAcquire(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    double tokens = 1.0;
    if (info.Length() > 0 && info[0].IsNumber()) {
        tokens = info[0].As<Napi::Number>().DoubleValue();
    }

    totalRequests_++;

    bool success = tryAcquireTokens(defaultBucket_, tokens);

    if (success) {
        allowedRequests_++;
    } else {
        throttledRequests_++;
    }

    return Napi::Boolean::New(env, success);
}

Napi::Value RateLimiter::TryAcquireForKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Key string expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string key = info[0].As<Napi::String>().Utf8Value();
    double tokens = 1.0;

    if (info.Length() > 1 && info[1].IsNumber()) {
        tokens = info[1].As<Napi::Number>().DoubleValue();
    }

    totalRequests_++;

    uint64_t keyHash = SIMDRateOps::fastHash(key.c_str(), key.length());

    std::lock_guard<std::mutex> lock(bucketsLock_);

    auto it = buckets_.find(key);
    if (it == buckets_.end()) {
        buckets_[key] = Bucket(tokensPerInterval_, interval_, burstSize_);
        it = buckets_.find(key);
    }

    bool success = tryAcquireTokens(it->second, tokens);

    if (success) {
        allowedRequests_++;
    } else {
        throttledRequests_++;
    }

    return Napi::Boolean::New(env, success);
}

Napi::Value RateLimiter::GetKeyStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Key string expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string key = info[0].As<Napi::String>().Utf8Value();

    std::lock_guard<std::mutex> lock(bucketsLock_);

    auto it = buckets_.find(key);
    if (it == buckets_.end()) {
        return env.Null();
    }

    refillTokens(it->second);

    Napi::Object status = Napi::Object::New(env);
    status.Set("tokens", Napi::Number::New(env, it->second.tokens));
    status.Set("tokensPerInterval", Napi::Number::New(env, it->second.tokensPerInterval));
    status.Set("interval", Napi::Number::New(env, it->second.interval));
    status.Set("burstSize", Napi::Number::New(env, it->second.burstSize));
    status.Set("utilization", Napi::Number::New(env,
        (it->second.burstSize - it->second.tokens) / it->second.burstSize));

    return status;
}

Napi::Value RateLimiter::RemoveKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Key string expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string key = info[0].As<Napi::String>().Utf8Value();

    std::lock_guard<std::mutex> lock(bucketsLock_);

    auto it = buckets_.find(key);
    if (it != buckets_.end()) {
        buckets_.erase(it);
        return Napi::Boolean::New(env, true);
    }

    return Napi::Boolean::New(env, false);
}

Napi::Value RateLimiter::SetOptions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Options object expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("tokensPerInterval") && options.Get("tokensPerInterval").IsNumber()) {
        tokensPerInterval_ = options.Get("tokensPerInterval").As<Napi::Number>().DoubleValue();
        defaultBucket_.tokensPerInterval = tokensPerInterval_;
    }

    if (options.Has("interval") && options.Get("interval").IsNumber()) {
        interval_ = options.Get("interval").As<Napi::Number>().DoubleValue();
        defaultBucket_.interval = interval_;
    }

    if (options.Has("burstSize") && options.Get("burstSize").IsNumber()) {
        burstSize_ = options.Get("burstSize").As<Napi::Number>().DoubleValue();
        defaultBucket_.burstSize = burstSize_;
        if (defaultBucket_.tokens > burstSize_) {
            defaultBucket_.tokens = burstSize_;
        }
    }

    if (options.Has("precision") && options.Get("precision").IsNumber()) {
        precision_ = options.Get("precision").As<Napi::Number>().DoubleValue();
    }

    return env.Undefined();
}

Napi::Value RateLimiter::GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object metrics = Napi::Object::New(env);

    uint64_t total = totalRequests_.load();
    uint64_t allowed = allowedRequests_.load();
    uint64_t throttled = throttledRequests_.load();
    uint64_t waitTime = totalWaitTime_.load();
    uint64_t maxBurst = maxBurstUsed_.load();

    metrics.Set("totalRequests", Napi::Number::New(env, total));
    metrics.Set("allowedRequests", Napi::Number::New(env, allowed));
    metrics.Set("throttledRequests", Napi::Number::New(env, throttled));
    metrics.Set("totalWaitTime", Napi::Number::New(env, waitTime));
    metrics.Set("maxBurstUsed", Napi::Number::New(env, maxBurst));

    if (total > 0) {
        double allowRate = static_cast<double>(allowed) / total;
        double throttleRate = static_cast<double>(throttled) / total;
        double avgWaitTime = static_cast<double>(waitTime) / total;

        metrics.Set("allowRate", Napi::Number::New(env, allowRate));
        metrics.Set("throttleRate", Napi::Number::New(env, throttleRate));
        metrics.Set("averageWaitTime", Napi::Number::New(env, avgWaitTime));

        double requestsPerSecond = static_cast<double>(total) / (waitTime / 1000000.0);
        metrics.Set("requestsPerSecond", Napi::Number::New(env, requestsPerSecond));
    }

    {
        std::lock_guard<std::mutex> lock(bucketsLock_);
        metrics.Set("activeBuckets", Napi::Number::New(env, buckets_.size()));

        if (!buckets_.empty()) {
            double totalUtilization = 0.0;
            for (const auto& pair : buckets_) {
                double utilization = (pair.second.burstSize - pair.second.tokens) / pair.second.burstSize;
                totalUtilization += utilization;
            }
            double avgUtilization = totalUtilization / buckets_.size();
            metrics.Set("averageBucketUtilization", Napi::Number::New(env, avgUtilization));
        }
    }

    metrics.Set("defaultTokensPerInterval", Napi::Number::New(env, tokensPerInterval_));
    metrics.Set("defaultInterval", Napi::Number::New(env, interval_));
    metrics.Set("defaultBurstSize", Napi::Number::New(env, burstSize_));
    metrics.Set("precision", Napi::Number::New(env, precision_));

    return metrics;
}

Napi::Value RateLimiter::ResetMetrics(const Napi::CallbackInfo& info) {
    totalRequests_ = 0;
    allowedRequests_ = 0;
    throttledRequests_ = 0;
    totalWaitTime_ = 0;
    maxBurstUsed_ = 0;

    return info.Env().Undefined();
}

} // namespace nexurejs
