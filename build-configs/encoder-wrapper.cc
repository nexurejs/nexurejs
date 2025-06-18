#include <napi.h>
#include "src/native/encoding/string_encoder.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Initialize just the StringEncoder
  nexurejs::StringEncoder::Init(env, exports);

  return exports;
}

// Use a different approach for the module initialization
NODE_API_MODULE(encoder_wrapper, InitAll)
