#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <algorithm>
#include <stdexcept>
#include <cstring>
#include <mutex>

/**
 * Standalone string encoder for testing
 */
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
    // Initialize metrics to zero
    totalEncodeCount = 0;
    totalDecodeCount = 0;
    totalTimeMs = 0;
  }

private:
  static Napi::FunctionReference constructor;

  // Performance metrics
  uint64_t totalEncodeCount;
  uint64_t totalDecodeCount;
  uint64_t totalTimeMs;
  std::mutex metricsMutex;

  // URL Encode method
  Napi::Value UrlEncode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
      // Get the input string
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("URL Encode requires a string input");
      }

      std::string input = info[0].As<Napi::String>().Utf8Value();
      std::string result;
      result.reserve(input.length() * 3); // Worst case scenario

      // Perform the encoding
      for (char c : input) {
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
            (c >= '0' && c <= '9') || c == '-' || c == '_' ||
            c == '.' || c == '~') {
          // Unreserved characters
          result.push_back(c);
        } else if (c == ' ') {
          // Space becomes '+'
          result.push_back('+');
        } else {
          // Everything else becomes %XX
          result.push_back('%');
          char hex[3];
          sprintf(hex, "%02X", static_cast<unsigned char>(c));
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

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
      // Get the input string
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("URL Decode requires a string input");
      }

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
          std::string hex = input.substr(i + 1, 2);
          char byte = 0;

          for (int j = 0; j < 2; j++) {
            byte *= 16;
            if (hex[j] >= '0' && hex[j] <= '9') {
              byte += hex[j] - '0';
            } else if (hex[j] >= 'A' && hex[j] <= 'F') {
              byte += hex[j] - 'A' + 10;
            } else if (hex[j] >= 'a' && hex[j] <= 'f') {
              byte += hex[j] - 'a' + 10;
            }
          }

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

  // Simple Base64 encode (limited implementation for testing)
  Napi::Value Base64Encode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
      // Get the input string
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("Base64 Encode requires a string input");
      }

      std::string input = info[0].As<Napi::String>().Utf8Value();

      // Basic base64 table
      static const char* base64_chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

      std::string result;
      int i = 0;
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

          for(j = 0; j < 4; j++) {
            result += base64_chars[char_array_4[j]];
          }

          j = 0;
        }
      }

      if (j) {
        for(int k = j; k < 3; k++) {
          char_array_3[k] = '\0';
        }

        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);

        for (int k = 0; k < j + 1; k++) {
          result += base64_chars[char_array_4[k]];
        }

        while (j++ < 3) {
          result += '=';
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

  // Simple Base64 decode (limited implementation for testing)
  Napi::Value Base64Decode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
      // Get the input string
      if (info.Length() < 1 || !info[0].IsString()) {
        throw std::runtime_error("Base64 Decode requires a string input");
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
      int i = 0;
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
            result += char_array_3[j];
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
          result += char_array_3[k];
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

    // This is a simple approach using thread_local for the instance
    static thread_local Napi::ObjectReference instance;

    if (instance.IsEmpty()) {
      Napi::Object obj = constructor.New({});
      instance = Napi::Persistent(obj);
    }

    return instance.Value();
  }
};

// Initialize static member
Napi::FunctionReference StringEncoder::constructor;

// Initialize module
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Install only the StringEncoder
  return StringEncoder::Init(env, exports);
}

// Register module
NODE_API_MODULE(standalone_encoder, InitAll)
