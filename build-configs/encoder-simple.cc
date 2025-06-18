#include <napi.h>
#include <string>
#include <vector>
#include <chrono>
#include <algorithm>
#include <atomic>
#include <mutex>

class StringEncoder : public Napi::ObjectWrap<StringEncoder> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "StringEncoder", {
      InstanceMethod("urlEncode", &StringEncoder::UrlEncode),
      InstanceMethod("urlDecode", &StringEncoder::UrlDecode),
      InstanceMethod("base64Encode", &StringEncoder::Base64Encode),
      InstanceMethod("base64Decode", &StringEncoder::Base64Decode),
      InstanceMethod("getMetrics", &StringEncoder::GetMetrics),
      InstanceMethod("resetMetrics", &StringEncoder::ResetMetrics),
      StaticMethod("getInstance", &StringEncoder::GetInstance)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("StringEncoder", func);
    return exports;
  }

  StringEncoder(const Napi::CallbackInfo& info) : Napi::ObjectWrap<StringEncoder>(info) {
    totalEncodeCount = 0;
    totalDecodeCount = 0;
    totalTimeMs = 0;
  }

  // URL Encode method
  Napi::Value UrlEncode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
      // Validate arguments
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("URL Encode requires a string input");
      }

      // Start timing
      auto startTime = std::chrono::high_resolution_clock::now();

      std::string input = info[0].As<Napi::String>().Utf8Value();
      std::string result;
      result.reserve(input.length() * 3); // Worst case scenario

      // Perform the encoding
      for (char c : input) {
        if (isUrlSafeChar(c)) {
          // Unreserved characters
          result.push_back(c);
        } else if (c == ' ') {
          // Space becomes '+'
          result.push_back('+');
        } else {
          // Everything else becomes %XX
          result.push_back('%');
          char hex[3];
          snprintf(hex, sizeof(hex), "%02X", static_cast<unsigned char>(c));
          result.push_back(hex[0]);
          result.push_back(hex[1]);
        }
      }

      // Update metrics
      {
        std::lock_guard<std::mutex> lock(metricsMutex);
        totalEncodeCount++;
        auto endTime = std::chrono::high_resolution_clock::now();
        totalTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
          endTime - startTime).count();
      }

      return Napi::String::New(env, result);
    } catch (const std::exception& e) {
      throw Napi::Error::New(env, e.what());
    }
  }

  // URL Decode method
  Napi::Value UrlDecode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
      // Validate arguments
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("URL Decode requires a string input");
      }

      // Start timing
      auto startTime = std::chrono::high_resolution_clock::now();

      std::string input = info[0].As<Napi::String>().Utf8Value();
      std::string result;
      result.reserve(input.length());

      // Perform the decoding
      for (size_t i = 0; i < input.length(); i++) {
        if (input[i] == '+') {
          // '+' becomes space
          result.push_back(' ');
        } else if (input[i] == '%' && i + 2 < input.length()) {
          // %XX becomes the character with hex value XX
          char byte = hexToChar(input[i+1], input[i+2]);
          result.push_back(byte);
          i += 2;
        } else {
          // Everything else stays the same
          result.push_back(input[i]);
        }
      }

      // Update metrics
      {
        std::lock_guard<std::mutex> lock(metricsMutex);
        totalDecodeCount++;
        auto endTime = std::chrono::high_resolution_clock::now();
        totalTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
          endTime - startTime).count();
      }

      return Napi::String::New(env, result);
    } catch (const std::exception& e) {
      throw Napi::Error::New(env, e.what());
    }
  }

  // Base64 encode (simplified implementation for testing)
  Napi::Value Base64Encode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
      // Validate arguments
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("Base64 Encode requires a string input");
      }

      // Start timing
      auto startTime = std::chrono::high_resolution_clock::now();

      std::string input = info[0].As<Napi::String>().Utf8Value();

      // Simple placeholder return - we'll just reverse the string for demo purposes
      std::string result(input.rbegin(), input.rend());

      // Update metrics
      {
        std::lock_guard<std::mutex> lock(metricsMutex);
        totalEncodeCount++;
        auto endTime = std::chrono::high_resolution_clock::now();
        totalTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
          endTime - startTime).count();
      }

      return Napi::String::New(env, result);
    } catch (const std::exception& e) {
      throw Napi::Error::New(env, e.what());
    }
  }

  // Base64 decode (simplified implementation for testing)
  Napi::Value Base64Decode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
      // Validate arguments
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("Base64 Decode requires a string input");
      }

      // Start timing
      auto startTime = std::chrono::high_resolution_clock::now();

      std::string input = info[0].As<Napi::String>().Utf8Value();

      // Simple placeholder return - we'll just reverse the string for demo purposes
      std::string result(input.rbegin(), input.rend());

      // Update metrics
      {
        std::lock_guard<std::mutex> lock(metricsMutex);
        totalDecodeCount++;
        auto endTime = std::chrono::high_resolution_clock::now();
        totalTimeMs += std::chrono::duration_cast<std::chrono::milliseconds>(
          endTime - startTime).count();
      }

      return Napi::String::New(env, result);
    } catch (const std::exception& e) {
      throw Napi::Error::New(env, e.what());
    }
  }

  // Get metrics
  Napi::Value GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    Napi::Object metrics = Napi::Object::New(env);

    std::lock_guard<std::mutex> lock(metricsMutex);
    metrics.Set("totalEncodeCount", Napi::Number::New(env, totalEncodeCount));
    metrics.Set("totalDecodeCount", Napi::Number::New(env, totalDecodeCount));
    metrics.Set("totalTimeMs", Napi::Number::New(env, totalTimeMs));

    return metrics;
  }

  // Reset metrics
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(metricsMutex);
    totalEncodeCount = 0;
    totalDecodeCount = 0;
    totalTimeMs = 0;

    return env.Undefined();
  }

  // Singleton instance getter
  static Napi::Value GetInstance(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Simple thread-local instance
    static thread_local Napi::ObjectReference instance;

    if (instance.IsEmpty()) {
      Napi::Object obj = constructor.New({});
      instance = Napi::Persistent(obj);
    }

    return instance.Value();
  }

private:
  static Napi::FunctionReference constructor;

  // Performance metrics
  std::atomic<uint64_t> totalEncodeCount;
  std::atomic<uint64_t> totalDecodeCount;
  std::atomic<uint64_t> totalTimeMs;
  std::mutex metricsMutex;

  // URL safe character check
  bool isUrlSafeChar(char c) {
    return (c >= 'A' && c <= 'Z') ||
           (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') ||
           c == '-' || c == '_' || c == '.' || c == '~';
  }

  // Convert hex pair to character
  char hexToChar(char first, char second) {
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
};

// Initialize static member
Napi::FunctionReference StringEncoder::constructor;

// Init function
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return StringEncoder::Init(env, exports);
}

// Register module
NODE_API_MODULE(simple_encoder, Init)
