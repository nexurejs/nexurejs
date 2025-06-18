#include <napi.h>
#include "src/native/encoding/string_encoder.h"

namespace nexurejs {

// Forward declaration
void RegisterComponent(const std::string& name, std::function<void()> cleanup);

// Implementation of RegisterComponent used by StringEncoder
void RegisterComponent(const std::string& name, std::function<void()> cleanup) {
    // Simple implementation that does nothing for testing
}

/**
 * Initialize just the StringEncoder
 * We need a function that returns Napi::Object for node-addon-api
 */
Napi::Object InitInternal(Napi::Env env, Napi::Object exports) {
    // Only initialize StringEncoder
    StringEncoder::Init(env, exports);

    // Add version info
    exports.Set("version", Napi::String::New(env, "0.2.0-simple"));
    exports.Set("isSimplified", Napi::Boolean::New(env, true));

    return exports;
}

} // namespace nexurejs

// We need a C-style function for NAPI_MODULE
napi_value Init(napi_env env, napi_value exports) {
    Napi::Env napi_env(env);
    Napi::Object napi_exports(napi_env, exports);

    // Call our internal init
    napi_exports = nexurejs::InitInternal(napi_env, napi_exports);

    return exports;
}

// Register module with NAPI_MODULE
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
