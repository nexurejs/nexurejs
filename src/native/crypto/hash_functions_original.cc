#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <openssl/md5.h>

/**
 * High-performance cryptographic hash functions
 * Provides native implementations of common cryptographic operations
 * Using OpenSSL for maximum performance and security
 */
class HashFunctions : public Napi::ObjectWrap<HashFunctions> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  HashFunctions(const Napi::CallbackInfo& info);

private:
  // Timing metrics
  double md5Time_ = 0;
  size_t md5Count_ = 0;
  double sha1Time_ = 0;
  size_t sha1Count_ = 0;
  double sha256Time_ = 0;
  size_t sha256Count_ = 0;
  double sha512Time_ = 0;
  size_t sha512Count_ = 0;
  double hmacTime_ = 0;
  size_t hmacCount_ = 0;

  // Reference to metrics object
  Napi::ObjectReference metricsObject_;

  // Exposed methods
  Napi::Value MD5(const Napi::CallbackInfo& info);
  Napi::Value SHA1(const Napi::CallbackInfo& info);
  Napi::Value SHA256(const Napi::CallbackInfo& info);
  Napi::Value SHA512(const Napi::CallbackInfo& info);
  Napi::Value HMAC(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

  // Internal methods
  void updateMetrics();
  std::string bytesToHex(const unsigned char* data, size_t length);
  std::string digestWithEVP(const std::string& input, const EVP_MD* md);
};

// Initialize the module
Napi::Object HashFunctions::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "HashFunctions", {
    InstanceMethod("md5", &HashFunctions::MD5),
    InstanceMethod("sha1", &HashFunctions::SHA1),
    InstanceMethod("sha256", &HashFunctions::SHA256),
    InstanceMethod("sha512", &HashFunctions::SHA512),
    InstanceMethod("hmac", &HashFunctions::HMAC),
    InstanceMethod("getMetrics", &HashFunctions::GetMetrics),
    InstanceMethod("resetMetrics", &HashFunctions::ResetMetrics),
  });

  Napi::FunctionReference* constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);

  exports.Set("HashFunctions", func);
  return exports;
}

// Constructor
HashFunctions::HashFunctions(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<HashFunctions>(info) {
  Napi::Env env = info.Env();

  // Initialize metrics object
  Napi::Object metrics = Napi::Object::New(env);
  metrics.Set("md5Time", Napi::Number::New(env, 0));
  metrics.Set("md5Count", Napi::Number::New(env, 0));
  metrics.Set("sha1Time", Napi::Number::New(env, 0));
  metrics.Set("sha1Count", Napi::Number::New(env, 0));
  metrics.Set("sha256Time", Napi::Number::New(env, 0));
  metrics.Set("sha256Count", Napi::Number::New(env, 0));
  metrics.Set("sha512Time", Napi::Number::New(env, 0));
  metrics.Set("sha512Count", Napi::Number::New(env, 0));
  metrics.Set("hmacTime", Napi::Number::New(env, 0));
  metrics.Set("hmacCount", Napi::Number::New(env, 0));
  metricsObject_ = Napi::Persistent(metrics);
}

// Helper function to calculate a digest using EVP API
std::string HashFunctions::digestWithEVP(const std::string& input, const EVP_MD* md) {
  EVP_MD_CTX* mdctx = EVP_MD_CTX_new();
  unsigned char digest[EVP_MAX_MD_SIZE];
  unsigned int digest_len = 0;

  EVP_DigestInit_ex(mdctx, md, NULL);
  EVP_DigestUpdate(mdctx, input.c_str(), input.length());
  EVP_DigestFinal_ex(mdctx, digest, &digest_len);
  EVP_MD_CTX_free(mdctx);

  return bytesToHex(digest, digest_len);
}

// Calculate MD5 hash
Napi::Value HashFunctions::MD5(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Input data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get input data
  std::string input;
  if (info[0].IsString()) {
    input = info[0].As<Napi::String>().Utf8Value();
  } else if (info[0].IsBuffer()) {
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  // Calculate MD5 hash using EVP API
  std::string result = digestWithEVP(input, EVP_md5());

  // Stop timing
  auto endTime = std::chrono::high_resolution_clock::now();
  double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
  md5Time_ += duration;
  md5Count_++;
  updateMetrics();

  // Return hex string
  return Napi::String::New(env, result);
}

// Calculate SHA-1 hash
Napi::Value HashFunctions::SHA1(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Input data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get input data
  std::string input;
  if (info[0].IsString()) {
    input = info[0].As<Napi::String>().Utf8Value();
  } else if (info[0].IsBuffer()) {
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  // Calculate SHA-1 hash using EVP API
  std::string result = digestWithEVP(input, EVP_sha1());

  // Stop timing
  auto endTime = std::chrono::high_resolution_clock::now();
  double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
  sha1Time_ += duration;
  sha1Count_++;
  updateMetrics();

  // Return hex string
  return Napi::String::New(env, result);
}

// Calculate SHA-256 hash
Napi::Value HashFunctions::SHA256(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Input data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get input data
  std::string input;
  if (info[0].IsString()) {
    input = info[0].As<Napi::String>().Utf8Value();
  } else if (info[0].IsBuffer()) {
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  // Calculate SHA-256 hash using EVP API
  std::string result = digestWithEVP(input, EVP_sha256());

  // Stop timing
  auto endTime = std::chrono::high_resolution_clock::now();
  double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
  sha256Time_ += duration;
  sha256Count_++;
  updateMetrics();

  // Return hex string
  return Napi::String::New(env, result);
}

// Calculate SHA-512 hash
Napi::Value HashFunctions::SHA512(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Input data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get input data
  std::string input;
  if (info[0].IsString()) {
    input = info[0].As<Napi::String>().Utf8Value();
  } else if (info[0].IsBuffer()) {
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  // Calculate SHA-512 hash using EVP API
  std::string result = digestWithEVP(input, EVP_sha512());

  // Stop timing
  auto endTime = std::chrono::high_resolution_clock::now();
  double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
  sha512Time_ += duration;
  sha512Count_++;
  updateMetrics();

  // Return hex string
  return Napi::String::New(env, result);
}

// Calculate HMAC
Napi::Value HashFunctions::HMAC(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Data, key, and algorithm expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get input data
  std::string input;
  if (info[0].IsString()) {
    input = info[0].As<Napi::String>().Utf8Value();
  } else if (info[0].IsBuffer()) {
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    input = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected for data").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get key
  std::string key;
  if (info[1].IsString()) {
    key = info[1].As<Napi::String>().Utf8Value();
  } else if (info[1].IsBuffer()) {
    Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
    key = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected for key").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get algorithm
  if (!info[2].IsString()) {
    Napi::TypeError::New(env, "String expected for algorithm").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string algorithm = info[2].As<Napi::String>().Utf8Value();

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  // Choose algorithm
  const EVP_MD* md = nullptr;
  if (algorithm == "md5") {
    md = EVP_md5();
  } else if (algorithm == "sha1") {
    md = EVP_sha1();
  } else if (algorithm == "sha256") {
    md = EVP_sha256();
  } else if (algorithm == "sha512") {
    md = EVP_sha512();
  } else {
    Napi::TypeError::New(env, "Unsupported algorithm. Use 'md5', 'sha1', 'sha256', or 'sha512'")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Calculate HMAC using EVP API
  unsigned int digestLen = 0;
  unsigned char digest[EVP_MAX_MD_SIZE];

  // Create EVP_PKEY_CTX for the HMAC operation
  EVP_MD_CTX* ctx = EVP_MD_CTX_new();
  EVP_PKEY* pkey = EVP_PKEY_new_mac_key(EVP_PKEY_HMAC, nullptr,
                  reinterpret_cast<const unsigned char*>(key.c_str()), key.length());

  EVP_DigestSignInit(ctx, nullptr, md, nullptr, pkey);
  EVP_DigestSignUpdate(ctx, input.c_str(), input.length());

  size_t len = EVP_MAX_MD_SIZE;
  EVP_DigestSignFinal(ctx, digest, &len);
  digestLen = static_cast<unsigned int>(len);

  EVP_MD_CTX_free(ctx);
  EVP_PKEY_free(pkey);

  // Convert to hex string
  std::string result = bytesToHex(digest, digestLen);

  // Stop timing
  auto endTime = std::chrono::high_resolution_clock::now();
  double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
  hmacTime_ += duration;
  hmacCount_++;
  updateMetrics();

  // Return hex string
  return Napi::String::New(env, result);
}

// Get metrics
Napi::Value HashFunctions::GetMetrics(const Napi::CallbackInfo& info) {
  updateMetrics();
  return metricsObject_.Value();
}

// Reset metrics
Napi::Value HashFunctions::ResetMetrics(const Napi::CallbackInfo& info) {
  md5Time_ = 0;
  md5Count_ = 0;
  sha1Time_ = 0;
  sha1Count_ = 0;
  sha256Time_ = 0;
  sha256Count_ = 0;
  sha512Time_ = 0;
  sha512Count_ = 0;
  hmacTime_ = 0;
  hmacCount_ = 0;

  updateMetrics();
  return info.Env().Undefined();
}

// Update metrics object
void HashFunctions::updateMetrics() {
  Napi::Env env = metricsObject_.Env();
  Napi::Object metrics = metricsObject_.Value().As<Napi::Object>();

  metrics.Set("md5Time", Napi::Number::New(env, md5Time_));
  metrics.Set("md5Count", Napi::Number::New(env, md5Count_));
  metrics.Set("sha1Time", Napi::Number::New(env, sha1Time_));
  metrics.Set("sha1Count", Napi::Number::New(env, sha1Count_));
  metrics.Set("sha256Time", Napi::Number::New(env, sha256Time_));
  metrics.Set("sha256Count", Napi::Number::New(env, sha256Count_));
  metrics.Set("sha512Time", Napi::Number::New(env, sha512Time_));
  metrics.Set("sha512Count", Napi::Number::New(env, sha512Count_));
  metrics.Set("hmacTime", Napi::Number::New(env, hmacTime_));
  metrics.Set("hmacCount", Napi::Number::New(env, hmacCount_));

  // Calculate average times
  metrics.Set("md5AvgTime", Napi::Number::New(env, md5Count_ > 0 ? md5Time_ / md5Count_ : 0));
  metrics.Set("sha1AvgTime", Napi::Number::New(env, sha1Count_ > 0 ? sha1Time_ / sha1Count_ : 0));
  metrics.Set("sha256AvgTime", Napi::Number::New(env, sha256Count_ > 0 ? sha256Time_ / sha256Count_ : 0));
  metrics.Set("sha512AvgTime", Napi::Number::New(env, sha512Count_ > 0 ? sha512Time_ / sha512Count_ : 0));
  metrics.Set("hmacAvgTime", Napi::Number::New(env, hmacCount_ > 0 ? hmacTime_ / hmacCount_ : 0));
}

// Convert bytes to hex string
std::string HashFunctions::bytesToHex(const unsigned char* data, size_t length) {
  static const char hex[] = "0123456789abcdef";
  std::string result;
  result.reserve(length * 2);

  for (size_t i = 0; i < length; ++i) {
    result.push_back(hex[(data[i] >> 4) & 0xF]);
    result.push_back(hex[data[i] & 0xF]);
  }

  return result;
}
