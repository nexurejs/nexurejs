#include <napi.h>
#include "src/native/encoding/string_encoder.h"

// Implementation of RegisterComponent used by StringEncoder
namespace nexurejs {
  void RegisterComponent(const std::string& name, std::function<void()> cleanup) {
    // Do nothing, this is just to satisfy the StringEncoder's dependency
  }
}

/**
 * Absolutely minimal initialization function - only StringEncoder
 */
napi_value Init(napi_env env, napi_value exports) {
  Napi::Env napi_env(env);
  Napi::Object napi_exports(napi_env, exports);

  // Only initialize StringEncoder, nothing else
  nexurejs::StringEncoder::Init(napi_env, napi_exports);

  // Add version info
  napi_exports.Set("version", Napi::String::New(napi_env, "0.1.0-minimal"));
  napi_exports.Set("isMinimal", Napi::Boolean::New(napi_env, true));

  return exports;
}

// Register with Node.js
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
