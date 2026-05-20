#include <napi.h>
#include <string>
#include <unordered_map>
#include <sstream>
#include <algorithm>

namespace nexurejs {

class SafeHttpParser : public Napi::ObjectWrap<SafeHttpParser> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  SafeHttpParser(const Napi::CallbackInfo& info);
  ~SafeHttpParser() = default;

private:
  // Main parsing methods
  Napi::Value ParseRequest(const Napi::CallbackInfo& info);
  Napi::Value ParseHeaders(const Napi::CallbackInfo& info);
  Napi::Value ParseBody(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);

  // Safe parsing helpers
  bool SafeParseRequestLine(const std::string& data, Napi::Object& result, Napi::Env env);
  bool SafeParseHeaders(const std::string& data, Napi::Object& headers, Napi::Env env,
                        bool skipRequestLine);
  std::string SafeTrim(const std::string& str);
  std::vector<std::string> SafeSplit(const std::string& str, const std::string& delimiter);

  // Performance metrics
  uint64_t parseCount_ = 0;
  uint64_t successfulParses_ = 0;
  uint64_t totalParseTime_ = 0;
};

Napi::FunctionReference SafeHttpParser::constructor;

Napi::Object SafeHttpParser::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "HttpParser", {
    InstanceMethod("parseRequest", &SafeHttpParser::ParseRequest),
    InstanceMethod("parseHeaders", &SafeHttpParser::ParseHeaders),
    InstanceMethod("parseBody", &SafeHttpParser::ParseBody),
    InstanceMethod("reset", &SafeHttpParser::Reset),
    InstanceMethod("getMetrics", &SafeHttpParser::GetMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("HttpParser", func);
  return exports;
}

SafeHttpParser::SafeHttpParser(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<SafeHttpParser>(info) {
  // Simple, safe constructor
}

Napi::Value SafeHttpParser::ParseRequest(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  auto startTime = std::chrono::high_resolution_clock::now();
  parseCount_++;

  try {
    // Safe parameter validation
    if (info.Length() < 1) {
      Napi::TypeError::New(env, "Expected HTTP request string or buffer").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::string requestData;

    // Handle both string and buffer inputs safely
    if (info[0].IsString()) {
      requestData = info[0].As<Napi::String>().Utf8Value();
    } else if (info[0].IsBuffer()) {
      Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
      if (buffer.Length() > 0 && buffer.Data() != nullptr) {
        requestData = std::string(buffer.Data(), buffer.Length());
      }
    } else {
      Napi::TypeError::New(env, "Expected string or buffer").ThrowAsJavaScriptException();
      return env.Null();
    }

    // Basic safety check
    if (requestData.empty() || requestData.length() > 1024 * 1024) { // Max 1MB
      Napi::Error::New(env, "Invalid request data size").ThrowAsJavaScriptException();
      return env.Null();
    }

    // Create result object
    Napi::Object result = Napi::Object::New(env);

    // Safe request line parsing
    if (!SafeParseRequestLine(requestData, result, env)) {
      Napi::Error::New(env, "Failed to parse request line").ThrowAsJavaScriptException();
      return env.Null();
    }

    // Safe headers parsing
    Napi::Object headers = Napi::Object::New(env);
    if (!SafeParseHeaders(requestData, headers, env, true)) {
      Napi::Error::New(env, "Failed to parse headers").ThrowAsJavaScriptException();
      return env.Null();
    }

    result.Set("headers", headers);
    result.Set("complete", Napi::Boolean::New(env, true));

    // Calculate parse time
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);
    totalParseTime_ += duration.count();
    successfulParses_++;

    result.Set("parseTime", Napi::Number::New(env, duration.count()));

    return result;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Parse error: ") + e.what()).ThrowAsJavaScriptException();
    return env.Null();
  } catch (...) {
    Napi::Error::New(env, "Unknown parse error").ThrowAsJavaScriptException();
    return env.Null();
  }
}

bool SafeHttpParser::SafeParseRequestLine(const std::string& data, Napi::Object& result, Napi::Env env) {
  try {
    // Find first line (request line) - fix line ending detection
    size_t firstLineEnd = data.find("\r\n");
    if (firstLineEnd == std::string::npos) {
      firstLineEnd = data.find("\n");
      if (firstLineEnd == std::string::npos) {
        return false;
      }
    }

    std::string requestLine = data.substr(0, firstLineEnd);
    if (requestLine.empty()) {
      return false;
    }

    // Split by spaces safely
    std::vector<std::string> parts = SafeSplit(requestLine, " ");
    if (parts.size() < 3) {
      return false;
    }

    // Extract method, URL, and version safely
    std::string method = SafeTrim(parts[0]);
    std::string url = SafeTrim(parts[1]);
    std::string version = SafeTrim(parts[2]);

    // Basic validation
    if (method.empty() || url.empty() || version.empty()) {
      return false;
    }

    if (method.length() > 32 || url.length() > 8192 || version.length() > 32) {
      return false;
    }

    // Set result properties
    result.Set("method", Napi::String::New(env, method));
    result.Set("url", Napi::String::New(env, url));
    result.Set("version", Napi::String::New(env, version));

    // Parse URL components safely
    size_t queryPos = url.find('?');
    if (queryPos != std::string::npos) {
      std::string path = url.substr(0, queryPos);
      std::string query = url.substr(queryPos + 1);
      result.Set("path", Napi::String::New(env, path));
      result.Set("query", Napi::String::New(env, query));
    } else {
      result.Set("path", Napi::String::New(env, url));
      result.Set("query", Napi::String::New(env, ""));
    }

    return true;

  } catch (...) {
    return false;
  }
}

bool SafeHttpParser::SafeParseHeaders(const std::string& data, Napi::Object& headers,
                                      Napi::Env env, bool skipRequestLine) {
  try {
    // Where the header block begins. For a full request the request line
    // precedes the headers and must be skipped; for headers-only input
    // parsing must start at offset 0, otherwise the first header is dropped.
    size_t headersStart = 0;
    if (skipRequestLine) {
      size_t firstLineEnd = data.find("\r\n");
      if (firstLineEnd == std::string::npos) {
        firstLineEnd = data.find("\n");
        if (firstLineEnd == std::string::npos) {
          return true; // No headers is valid
        }
        headersStart = firstLineEnd + 1;
      } else {
        headersStart = firstLineEnd + 2;
      }
    }

    size_t headersEnd = data.find("\r\n\r\n", headersStart);
    if (headersEnd == std::string::npos) {
      headersEnd = data.find("\n\n", headersStart);
      if (headersEnd == std::string::npos) {
        headersEnd = data.length();
      }
    }

    if (headersStart >= headersEnd) {
      return true; // No headers
    }

    std::string headersSection = data.substr(headersStart, headersEnd - headersStart);

    // Split headers by lines
    std::vector<std::string> headerLines = SafeSplit(headersSection, "\n");

    for (const std::string& line : headerLines) {
      std::string trimmedLine = SafeTrim(line);
      if (trimmedLine.empty()) {
        continue;
      }

      // Find colon separator
      size_t colonPos = trimmedLine.find(':');
      if (colonPos == std::string::npos || colonPos == 0) {
        continue;
      }

      std::string name = SafeTrim(trimmedLine.substr(0, colonPos));
      std::string value = SafeTrim(trimmedLine.substr(colonPos + 1));

      // Basic validation
      if (name.empty() || name.length() > 256 || value.length() > 8192) {
        continue;
      }

      // Convert header name to lowercase for consistency
      std::transform(name.begin(), name.end(), name.begin(), ::tolower);

      headers.Set(name, Napi::String::New(env, value));
    }

    return true;

  } catch (...) {
    return false;
  }
}

std::string SafeHttpParser::SafeTrim(const std::string& str) {
  if (str.empty()) {
    return str;
  }

  size_t start = 0;
  size_t end = str.length();

  // Find first non-whitespace
  while (start < end && std::isspace(str[start])) {
    start++;
  }

  // Find last non-whitespace
  while (end > start && std::isspace(str[end - 1])) {
    end--;
  }

  return str.substr(start, end - start);
}

std::vector<std::string> SafeHttpParser::SafeSplit(const std::string& str, const std::string& delimiter) {
  std::vector<std::string> result;

  if (str.empty() || delimiter.empty()) {
    result.push_back(str);
    return result;
  }

  size_t start = 0;
  size_t end = 0;

  while ((end = str.find(delimiter, start)) != std::string::npos) {
    if (end > start) {
      result.push_back(str.substr(start, end - start));
    }
    start = end + delimiter.length();

    // Safety limit
    if (result.size() > 1000) {
      break;
    }
  }

  if (start < str.length()) {
    result.push_back(str.substr(start));
  }

  return result;
}

Napi::Value SafeHttpParser::ParseHeaders(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected headers string").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string headersData = info[0].As<Napi::String>().Utf8Value();
  Napi::Object headers = Napi::Object::New(env);

  if (SafeParseHeaders(headersData, headers, env, false)) {
    return headers;
  } else {
    Napi::Error::New(env, "Failed to parse headers").ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value SafeHttpParser::ParseBody(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected body data").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Simple body parsing - just return the input as a string
  if (info[0].IsString()) {
    return info[0];
  } else if (info[0].IsBuffer()) {
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    return Napi::String::New(env, buffer.Data(), buffer.Length());
  }

  return Napi::String::New(env, "");
}

Napi::Value SafeHttpParser::Reset(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Reset metrics
  parseCount_ = 0;
  successfulParses_ = 0;
  totalParseTime_ = 0;

  return env.Undefined();
}

Napi::Value SafeHttpParser::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  metrics.Set("parseCount", Napi::Number::New(env, parseCount_));
  metrics.Set("successfulParses", Napi::Number::New(env, successfulParses_));
  metrics.Set("totalParseTime", Napi::Number::New(env, totalParseTime_));

  if (parseCount_ > 0) {
    double avgTime = static_cast<double>(totalParseTime_) / parseCount_;
    double successRate = static_cast<double>(successfulParses_) / parseCount_;
    metrics.Set("avgParseTime", Napi::Number::New(env, avgTime));
    metrics.Set("successRate", Napi::Number::New(env, successRate));
  }

  return metrics;
}

} // namespace nexurejs
