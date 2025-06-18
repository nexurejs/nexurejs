#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <openssl/md5.h>
#include <mutex>

namespace nexurejs {

/**
 * High-performance cryptographic hash functions - FIXED VERSION
 * Provides native implementations of common cryptographic operations
 * Using OpenSSL for maximum performance and security
 */
class HashFunctions : public Napi::ObjectWrap<HashFunctions> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  HashFunctions(const Napi::CallbackInfo& info);
  ~HashFunctions();

private:
  // Metrics structure
  struct Metrics {
    std::atomic<uint64_t> md5Count{0};
    std::atomic<uint64_t> sha1Count{0};
    std::atomic<uint64_t> sha256Count{0};
    std::atomic<uint64_t> sha512Count{0};
    std::atomic<uint64_t> hmacCount{0};
    std::atomic<uint64_t> totalHashingTimeUs{0};
  };

  // Thread-safe metrics
  static std::unique_ptr<Metrics> globalMetrics;
  static std::mutex metricsMutex;

  // Exposed methods
  Napi::Value Hash(const Napi::CallbackInfo& info);
  Napi::Value HMAC(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

  // Helper methods
  std::string bytesToHex(const unsigned char* data, size_t length) const;
  std::string calculateHash(const std::string& algorithm, const std::string& input);
  std::string calculateHMAC(const std::string& algorithm, const std::string& input, const std::string& key);
  const EVP_MD* getEVPAlgorithm(const std::string& algorithm);
};

// Static members
Napi::FunctionReference HashFunctions::constructor;
std::unique_ptr<HashFunctions::Metrics> HashFunctions::globalMetrics = std::make_unique<HashFunctions::Metrics>();
std::mutex HashFunctions::metricsMutex;

// Initialize the module
Napi::Object HashFunctions::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "HashFunctions", {
    InstanceMethod("hash", &HashFunctions::Hash),
    InstanceMethod("hmac", &HashFunctions::HMAC),
    InstanceMethod("getMetrics", &HashFunctions::GetMetrics),
    InstanceMethod("resetMetrics", &HashFunctions::ResetMetrics),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("HashFunctions", func);
  return exports;
}

// Constructor
HashFunctions::HashFunctions(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<HashFunctions>(info) {
  // Initialize OpenSSL if needed (thread-safe in modern versions)
}

// Destructor
HashFunctions::~HashFunctions() {
  // Cleanup if needed
}

// Main hash method
Napi::Value HashFunctions::Hash(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Algorithm and data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get algorithm
  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Algorithm must be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string algorithm = info[0].As<Napi::String>().Utf8Value();

  // Get input data
  std::string input;
  if (info[1].IsString()) {
    input = info[1].As<Napi::String>().Utf8Value();
  } else if (info[1].IsBuffer()) {
    Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "Data must be string or Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  try {
    auto start = std::chrono::high_resolution_clock::now();

    std::string result = calculateHash(algorithm, input);

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

    // Update metrics
    {
      std::lock_guard<std::mutex> lock(metricsMutex);
      globalMetrics->totalHashingTimeUs += duration;

      if (algorithm == "md5") globalMetrics->md5Count++;
      else if (algorithm == "sha1") globalMetrics->sha1Count++;
      else if (algorithm == "sha256") globalMetrics->sha256Count++;
      else if (algorithm == "sha512") globalMetrics->sha512Count++;
    }

    return Napi::String::New(env, result);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// HMAC method
Napi::Value HashFunctions::HMAC(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Algorithm, data, and key expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get algorithm
  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Algorithm must be a string").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string algorithm = info[0].As<Napi::String>().Utf8Value();

  // Get input data
  std::string input;
  if (info[1].IsString()) {
    input = info[1].As<Napi::String>().Utf8Value();
  } else if (info[1].IsBuffer()) {
    Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "Data must be string or Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get key
  std::string key;
  if (info[2].IsString()) {
    key = info[2].As<Napi::String>().Utf8Value();
  } else if (info[2].IsBuffer()) {
    Napi::Buffer<char> buffer = info[2].As<Napi::Buffer<char>>();
    key = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "Key must be string or Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  try {
    auto start = std::chrono::high_resolution_clock::now();

    std::string result = calculateHMAC(algorithm, input, key);

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

    // Update metrics
    {
      std::lock_guard<std::mutex> lock(metricsMutex);
      globalMetrics->hmacCount++;
      globalMetrics->totalHashingTimeUs += duration;
    }

    return Napi::String::New(env, result);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Get metrics
Napi::Value HashFunctions::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  std::lock_guard<std::mutex> lock(metricsMutex);

  metrics.Set("md5Count", Napi::Number::New(env, globalMetrics->md5Count.load()));
  metrics.Set("sha1Count", Napi::Number::New(env, globalMetrics->sha1Count.load()));
  metrics.Set("sha256Count", Napi::Number::New(env, globalMetrics->sha256Count.load()));
  metrics.Set("sha512Count", Napi::Number::New(env, globalMetrics->sha512Count.load()));
  metrics.Set("hmacCount", Napi::Number::New(env, globalMetrics->hmacCount.load()));

  uint64_t totalOps = globalMetrics->md5Count + globalMetrics->sha1Count +
                      globalMetrics->sha256Count + globalMetrics->sha512Count +
                      globalMetrics->hmacCount;

  metrics.Set("totalOperations", Napi::Number::New(env, totalOps));
  metrics.Set("totalHashingTimeMs", Napi::Number::New(env, globalMetrics->totalHashingTimeUs.load() / 1000.0));

  if (totalOps > 0) {
    double avgTimeUs = static_cast<double>(globalMetrics->totalHashingTimeUs.load()) / totalOps;
    metrics.Set("averageTimeUs", Napi::Number::New(env, avgTimeUs));
    metrics.Set("operationsPerSecond", Napi::Number::New(env, 1000000.0 / avgTimeUs));
  }

  return metrics;
}

// Reset metrics
Napi::Value HashFunctions::ResetMetrics(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(metricsMutex);

  globalMetrics->md5Count = 0;
  globalMetrics->sha1Count = 0;
  globalMetrics->sha256Count = 0;
  globalMetrics->sha512Count = 0;
  globalMetrics->hmacCount = 0;
  globalMetrics->totalHashingTimeUs = 0;

  return info.Env().Undefined();
}

// Calculate hash
std::string HashFunctions::calculateHash(const std::string& algorithm, const std::string& input) {
  const EVP_MD* md = getEVPAlgorithm(algorithm);
  if (!md) {
    throw std::runtime_error("Unsupported algorithm: " + algorithm);
  }

  EVP_MD_CTX* mdctx = EVP_MD_CTX_new();
  if (!mdctx) {
    throw std::runtime_error("Failed to create digest context");
  }

  unsigned char digest[EVP_MAX_MD_SIZE];
  unsigned int digest_len = 0;

  if (EVP_DigestInit_ex(mdctx, md, nullptr) != 1 ||
      EVP_DigestUpdate(mdctx, input.c_str(), input.length()) != 1 ||
      EVP_DigestFinal_ex(mdctx, digest, &digest_len) != 1) {
    EVP_MD_CTX_free(mdctx);
    throw std::runtime_error("Failed to calculate hash");
  }

  EVP_MD_CTX_free(mdctx);
  return bytesToHex(digest, digest_len);
}

// Calculate HMAC
std::string HashFunctions::calculateHMAC(const std::string& algorithm, const std::string& input, const std::string& key) {
  const EVP_MD* md = getEVPAlgorithm(algorithm);
  if (!md) {
    throw std::runtime_error("Unsupported algorithm: " + algorithm);
  }

  unsigned char digest[EVP_MAX_MD_SIZE];
  unsigned int digest_len = 0;

  HMAC(md, key.c_str(), key.length(),
       reinterpret_cast<const unsigned char*>(input.c_str()), input.length(),
       digest, &digest_len);

  return bytesToHex(digest, digest_len);
}

// Get EVP algorithm
const EVP_MD* HashFunctions::getEVPAlgorithm(const std::string& algorithm) {
  if (algorithm == "md5") return EVP_md5();
  if (algorithm == "sha1") return EVP_sha1();
  if (algorithm == "sha256") return EVP_sha256();
  if (algorithm == "sha384") return EVP_sha384();
  if (algorithm == "sha512") return EVP_sha512();
  return nullptr;
}

// Convert bytes to hex string
std::string HashFunctions::bytesToHex(const unsigned char* data, size_t length) const {
  static const char hex[] = "0123456789abcdef";
  std::string result;
  result.reserve(length * 2);

  for (size_t i = 0; i < length; ++i) {
    result.push_back(hex[(data[i] >> 4) & 0xF]);
    result.push_back(hex[data[i] & 0xF]);
  }

  return result;
}

} // namespace nexurejs

// Proper initialization
namespace {
  using namespace nexurejs;

  Napi::Object InitHashFunctions(Napi::Env env, Napi::Object exports) {
    return HashFunctions::Init(env, exports);
  }
}
