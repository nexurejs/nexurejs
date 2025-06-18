#include <napi.h>

namespace nexurejs {

class StringEncoderMinimal : public Napi::ObjectWrap<StringEncoderMinimal> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "StringEncoder", {
      InstanceMethod("urlEncode", &StringEncoderMinimal::UrlEncode),
      InstanceMethod("urlDecode", &StringEncoderMinimal::UrlDecode),
    });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("StringEncoder", func);
    return exports;
  }

  StringEncoderMinimal(const Napi::CallbackInfo& info) : Napi::ObjectWrap<StringEncoderMinimal>(info) {}

  Napi::Value UrlEncode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::string input = info[0].As<Napi::String>().Utf8Value();
    std::string result;

    // Simple URL encoding
    for (char c : input) {
      if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
        result += c;
      } else if (c == ' ') {
        result += '+';
      } else {
        char hex[4];
        snprintf(hex, sizeof(hex), "%%%02X", (unsigned char)c);
        result += hex;
      }
    }

    return Napi::String::New(env, result);
  }

  Napi::Value UrlDecode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::string input = info[0].As<Napi::String>().Utf8Value();
    std::string result;

    // Simple URL decoding
    for (size_t i = 0; i < input.length(); i++) {
      if (input[i] == '%' && i + 2 < input.length()) {
        int value = 0;
        sscanf(input.substr(i+1, 2).c_str(), "%x", &value);
        result += static_cast<char>(value);
        i += 2;
      } else if (input[i] == '+') {
        result += ' ';
      } else {
        result += input[i];
      }
    }

    return Napi::String::New(env, result);
  }
};

} // namespace nexurejs

// Register the module with Node.js
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return nexurejs::StringEncoderMinimal::Init(env, exports);
}

NODE_API_MODULE(minimal_native, Init)
