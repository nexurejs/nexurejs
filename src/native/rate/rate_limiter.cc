#include <napi.h>
#include <string>
#include <unordered_map>
#include <atomic>
#include <mutex>
#include <chrono>
#include <cmath>
#include <algorithm>

namespace nexurejs {

/**
 * RateLimiter - FIXED VERSION
 * Thread-safe rate limiting with distributed support
 */
class RateLimiter : public Napi::ObjectWrap<RateLimiter> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  RateLimiter(const Napi::CallbackInfo& info);
  ~RateLimiter();

private:
  // Token bucket structure
  struct TokenBucket {
    std::atomic<double> tokens{0};
    double tokensPerSecond;
    double maxTokens;
    std::chrono::steady_clock::time_point lastRefill;
    std::mutex bucketMutex;

    TokenBucket(double tps = 10.0, double max = 100.0)
      : tokens(max), tokensPerSecond(tps), maxTokens(max),
        lastRefill(std::chrono::steady_clock::now()) {}
  };

  // Configuration
  double defaultTokensPerSecond_;
  double defaultMaxTokens_;

  // Buckets for different keys
  std::unordered_map<std::string, std::unique_ptr<TokenBucket>> buckets_;
  std::mutex bucketsMapMutex_;

  // Global metrics
  std::atomic<uint64_t> totalRequests_{0};
  std::atomic<uint64_t> allowedRequests_{0};
  std::atomic<uint64_t> rejectedRequests_{0};

  // Methods
  Napi::Value Check(const Napi::CallbackInfo& info);
  Napi::Value Consume(const Napi::CallbackInfo& info);
  Napi::Value GetTokens(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value SetRate(const Napi::CallbackInfo& info);

  // Helper methods
  TokenBucket* getBucket(const std::string& key);
  void refillTokens(TokenBucket& bucket);
  bool tryConsume(TokenBucket& bucket, double tokens);
};

// Static members
Napi::FunctionReference RateLimiter::constructor;

// Initialize the module
Napi::Object RateLimiter::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "RateLimiter", {
    InstanceMethod("check", &RateLimiter::Check),
    InstanceMethod("consume", &RateLimiter::Consume),
    InstanceMethod("getTokens", &RateLimiter::GetTokens),
    InstanceMethod("reset", &RateLimiter::Reset),
    InstanceMethod("getMetrics", &RateLimiter::GetMetrics),
    InstanceMethod("setRate", &RateLimiter::SetRate),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("RateLimiter", func);
  return exports;
}

// Constructor
RateLimiter::RateLimiter(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<RateLimiter>(info) {
  defaultTokensPerSecond_ = 10.0;
  defaultMaxTokens_ = 100.0;

  // Parse options if provided
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("tokensPerSecond") && options.Get("tokensPerSecond").IsNumber()) {
      defaultTokensPerSecond_ = options.Get("tokensPerSecond").As<Napi::Number>().DoubleValue();
    }

    if (options.Has("maxTokens") && options.Get("maxTokens").IsNumber()) {
      defaultMaxTokens_ = options.Get("maxTokens").As<Napi::Number>().DoubleValue();
    }
  }
}

// Destructor
RateLimiter::~RateLimiter() {
  std::lock_guard<std::mutex> lock(bucketsMapMutex_);
  buckets_.clear();
}

// Get or create a bucket for a key
RateLimiter::TokenBucket* RateLimiter::getBucket(const std::string& key) {
  std::lock_guard<std::mutex> lock(bucketsMapMutex_);

  auto it = buckets_.find(key);
  if (it == buckets_.end()) {
    auto bucket = std::make_unique<TokenBucket>(defaultTokensPerSecond_, defaultMaxTokens_);
    auto* ptr = bucket.get();
    buckets_[key] = std::move(bucket);
    return ptr;
  }

  return it->second.get();
}

// Refill tokens based on elapsed time
void RateLimiter::refillTokens(TokenBucket& bucket) {
  auto now = std::chrono::steady_clock::now();
  auto elapsed = std::chrono::duration<double>(now - bucket.lastRefill).count();

  if (elapsed > 0) {
    double tokensToAdd = elapsed * bucket.tokensPerSecond;
    double currentTokens = bucket.tokens.load();
    double newTokens = std::min(currentTokens + tokensToAdd, bucket.maxTokens);

    bucket.tokens.store(newTokens);
    bucket.lastRefill = now;
  }
}

// Try to consume tokens
bool RateLimiter::tryConsume(TokenBucket& bucket, double tokens) {
  std::lock_guard<std::mutex> lock(bucket.bucketMutex);

  refillTokens(bucket);

  double currentTokens = bucket.tokens.load();
  if (currentTokens >= tokens) {
    bucket.tokens.store(currentTokens - tokens);
    return true;
  }

  return false;
}

// Check if tokens are available without consuming
Napi::Value RateLimiter::Check(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string key = "default";
  double tokens = 1.0;

  if (info.Length() > 0 && info[0].IsString()) {
    key = info[0].As<Napi::String>().Utf8Value();
  }

  if (info.Length() > 1 && info[1].IsNumber()) {
    tokens = info[1].As<Napi::Number>().DoubleValue();
  }

  auto* bucket = getBucket(key);

  {
    std::lock_guard<std::mutex> lock(bucket->bucketMutex);
    refillTokens(*bucket);
  }

  bool available = bucket->tokens.load() >= tokens;

  return Napi::Boolean::New(env, available);
}

// Consume tokens
Napi::Value RateLimiter::Consume(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string key = "default";
  double tokens = 1.0;

  if (info.Length() > 0 && info[0].IsString()) {
    key = info[0].As<Napi::String>().Utf8Value();
  }

  if (info.Length() > 1 && info[1].IsNumber()) {
    tokens = info[1].As<Napi::Number>().DoubleValue();
  }

  totalRequests_++;

  auto* bucket = getBucket(key);
  bool success = tryConsume(*bucket, tokens);

  if (success) {
    allowedRequests_++;
  } else {
    rejectedRequests_++;
  }

  return Napi::Boolean::New(env, success);
}

// Get current token count
Napi::Value RateLimiter::GetTokens(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string key = "default";
  if (info.Length() > 0 && info[0].IsString()) {
    key = info[0].As<Napi::String>().Utf8Value();
  }

  auto* bucket = getBucket(key);

  {
    std::lock_guard<std::mutex> lock(bucket->bucketMutex);
    refillTokens(*bucket);
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("tokens", Napi::Number::New(env, bucket->tokens.load()));
  result.Set("maxTokens", Napi::Number::New(env, bucket->maxTokens));
  result.Set("tokensPerSecond", Napi::Number::New(env, bucket->tokensPerSecond));

  return result;
}

// Reset a bucket
Napi::Value RateLimiter::Reset(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() > 0 && info[0].IsString()) {
    std::string key = info[0].As<Napi::String>().Utf8Value();

    std::lock_guard<std::mutex> lock(bucketsMapMutex_);
    auto it = buckets_.find(key);
    if (it != buckets_.end()) {
      std::lock_guard<std::mutex> bucketLock(it->second->bucketMutex);
      it->second->tokens.store(it->second->maxTokens);
      it->second->lastRefill = std::chrono::steady_clock::now();
    }
  } else {
    // Reset all buckets
    std::lock_guard<std::mutex> lock(bucketsMapMutex_);
    for (auto& pair : buckets_) {
      std::lock_guard<std::mutex> bucketLock(pair.second->bucketMutex);
      pair.second->tokens.store(pair.second->maxTokens);
      pair.second->lastRefill = std::chrono::steady_clock::now();
    }
  }

  return env.Undefined();
}

// Get metrics
Napi::Value RateLimiter::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  uint64_t total = totalRequests_.load();
  uint64_t allowed = allowedRequests_.load();
  uint64_t rejected = rejectedRequests_.load();

  metrics.Set("totalRequests", Napi::Number::New(env, total));
  metrics.Set("allowedRequests", Napi::Number::New(env, allowed));
  metrics.Set("rejectedRequests", Napi::Number::New(env, rejected));

  if (total > 0) {
    double allowRate = static_cast<double>(allowed) / total;
    double rejectRate = static_cast<double>(rejected) / total;
    metrics.Set("allowRate", Napi::Number::New(env, allowRate));
    metrics.Set("rejectRate", Napi::Number::New(env, rejectRate));
  }

  size_t bucketCount;
  {
    std::lock_guard<std::mutex> lock(bucketsMapMutex_);
    bucketCount = buckets_.size();
  }
  metrics.Set("activeBuckets", Napi::Number::New(env, bucketCount));

  return metrics;
}

// Set rate for a specific key
Napi::Value RateLimiter::SetRate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Key and options expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string key = info[0].As<Napi::String>().Utf8Value();
  Napi::Object options = info[1].As<Napi::Object>();

  auto* bucket = getBucket(key);

  std::lock_guard<std::mutex> lock(bucket->bucketMutex);

  if (options.Has("tokensPerSecond") && options.Get("tokensPerSecond").IsNumber()) {
    bucket->tokensPerSecond = options.Get("tokensPerSecond").As<Napi::Number>().DoubleValue();
  }

  if (options.Has("maxTokens") && options.Get("maxTokens").IsNumber()) {
    bucket->maxTokens = options.Get("maxTokens").As<Napi::Number>().DoubleValue();
    // Update current tokens if they exceed new max
    if (bucket->tokens.load() > bucket->maxTokens) {
      bucket->tokens.store(bucket->maxTokens);
    }
  }

  return env.Undefined();
}

} // namespace nexurejs
