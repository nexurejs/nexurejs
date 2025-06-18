#include <napi.h>
#include "encoding/string_encoder.h"
#include "thread/thread_pool.h"
#include "validation/validation_engine.h"

// Include all components except simdjson (causing issues)
#define INCLUDE_SIMDJSON 1
#define INCLUDE_OTHER_COMPONENTS 1

#if INCLUDE_SIMDJSON
#include "json/simdjson_wrapper.h"
#endif

#if INCLUDE_OTHER_COMPONENTS
#include "http/http_parser.h"
#include "http/object_pool.h"
#include "json/json_processor.h"
#include "routing/radix_router.h"
#include "url/url_parser.h"
#include "schema/schema_validator.h"
#include "compression/compression.h"
#include "websocket/websocket.h" // Re-enabling WebSocket
#include "cache/lru_cache.h"
#include "middleware/middleware_chain.h"
#include "crypto/hash_functions.h"
#include "file/file_operations.h"
#include "stream/stream_processor.h"
#include "compression/compression_engine.h"
#include "rate/rate_limiter.h"
#include "protobuf/protocol_buffers.h"
#endif

#include <mutex>
#include <vector>
#include <algorithm>

namespace nexurejs {

// Store references to constructors that need cleanup
std::vector<Napi::FunctionReference*> globalReferences;
std::mutex referencesMutex; // Protect access to globalReferences
bool isCleanupRegistered = false;
bool isCleanupExecuted = false;

// Store all initialized components for proper cleanup
struct Component {
    std::string name;
    std::function<void()> cleanup;
    bool cleanupCalled;
};
std::vector<Component> components;
std::mutex componentsMutex;

/**
 * Check if the native module is available
 */
Napi::Boolean IsAvailable(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, true);
}

/**
 * Add a reference to the global list for cleanup
 */
void AddCleanupReference(Napi::FunctionReference* ref) {
  if (!ref) return;

  // Thread-safe access to shared vector
  std::lock_guard<std::mutex> lock(referencesMutex);

  // Only add to globalReferences if cleanup hasn't run yet
  if (!isCleanupExecuted) {
    globalReferences.push_back(ref);
  } else {
    // If cleanup already ran, delete immediately
    delete ref;
  }
}

/**
 * Register a component with cleanup function
 */
void RegisterComponent(const std::string& name, std::function<void()> cleanup) {
    std::lock_guard<std::mutex> lock(componentsMutex);

    // Check if component already registered
    auto it = std::find_if(components.begin(), components.end(),
        [&name](const Component& c) { return c.name == name; });

    if (it == components.end()) {
        // Add new component
        components.push_back({name, cleanup, false});
    } else {
        // Update existing component
        it->cleanup = cleanup;
        it->cleanupCalled = false;
    }
}

/**
 * Initialize the NexureJS native module in stages
 * to identify where segmentation faults might occur
 */
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Initialize only the core components that worked in our minimal module

  exports.Set("initializationPhase", Napi::Number::New(env, 1));

  // Step 1: Initialize StringEncoder
  try {
    StringEncoder::Init(env, exports);
    exports.Set("stringEncoderInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("stringEncoderInitialized", Napi::Boolean::New(env, false));
    exports.Set("stringEncoderError", Napi::String::New(env, "Exception during StringEncoder initialization"));
  }

  exports.Set("initializationPhase", Napi::Number::New(env, 2));

  // Step 2: Initialize ThreadPool
  try {
    ThreadPool::Init(env, exports);
    exports.Set("threadPoolInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("threadPoolInitialized", Napi::Boolean::New(env, false));
    exports.Set("threadPoolError", Napi::String::New(env, "Exception during ThreadPool initialization"));
  }

  exports.Set("initializationPhase", Napi::Number::New(env, 3));

  // Step 3: Initialize ValidationEngine
  try {
    ValidationEngine::Init(env, exports);
    exports.Set("validationEngineInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("validationEngineInitialized", Napi::Boolean::New(env, false));
    exports.Set("validationEngineError", Napi::String::New(env, "Exception during ValidationEngine initialization"));
  }

#if INCLUDE_OTHER_COMPONENTS
  exports.Set("initializationPhase", Napi::Number::New(env, 5));

  // Step 5: Initialize other components
  try {
    HttpParser::Init(env, exports);
    exports.Set("httpParserInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("httpParserInitialized", Napi::Boolean::New(env, false));
  }

  try {
    JsonProcessor::Init(env, exports);
    exports.Set("jsonProcessorInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("jsonProcessorInitialized", Napi::Boolean::New(env, false));
  }

  try {
    RadixRouter::Init(env, exports);
    exports.Set("radixRouterInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("radixRouterInitialized", Napi::Boolean::New(env, false));
  }

  try {
    UrlParser::Init(env, exports);
    exports.Set("urlParserInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("urlParserInitialized", Napi::Boolean::New(env, false));
  }

  try {
    ObjectPool::Init(env, exports);
    exports.Set("objectPoolInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("objectPoolInitialized", Napi::Boolean::New(env, false));
  }

  // Enable LRUCache and Compression
  try {
    LRUCache::Init(env, exports);
    exports.Set("lruCacheInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("lruCacheInitialized", Napi::Boolean::New(env, false));
  }

  try {
    Compression::Init(env, exports);
    exports.Set("compressionInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("compressionInitialized", Napi::Boolean::New(env, false));
  }

      // Enable modules one by one to identify the problematic ones

  // CompressionEngine - Works!
  try {
    CompressionEngine::Init(env, exports);
    exports.Set("compressionEngineInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("compressionEngineInitialized", Napi::Boolean::New(env, false));
  }

  // SchemaValidator - testing individually
  try {
    SchemaValidator::Init(env, exports);
    exports.Set("schemaValidatorInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("schemaValidatorInitialized", Napi::Boolean::New(env, false));
  }

  // StreamProcessor - testing individually
  try {
    StreamProcessor::Init(env, exports);
    exports.Set("streamProcessorInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("streamProcessorInitialized", Napi::Boolean::New(env, false));
  }

  // ProtocolBuffers - testing individually
  try {
    ProtocolBuffers::Init(env, exports);
    exports.Set("protocolBuffersInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("protocolBuffersInitialized", Napi::Boolean::New(env, false));
  }

  // WebSocket - Works with libuv headers!
  try {
    InitWebSocket(env, exports);
    exports.Set("webSocketInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("webSocketInitialized", Napi::Boolean::New(env, false));
  }

#if INCLUDE_SIMDJSON
  // SIMDJSON - testing for the first time
  try {
    simdjson::builtin_implementation();
    exports.Set("simdjsonInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("simdjsonInitialized", Napi::Boolean::New(env, false));
  }
#endif

  // HashFunctions - testing fixed version
  try {
    nexurejs::HashFunctions::Init(env, exports);
    exports.Set("hashFunctionsInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("hashFunctionsInitialized", Napi::Boolean::New(env, false));
  }

  // MiddlewareChain - testing fixed version ✅
  try {
    nexurejs::MiddlewareChain::Init(env, exports);
    exports.Set("middlewareChainInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("middlewareChainInitialized", Napi::Boolean::New(env, false));
  }

  // FileOperations - testing fixed version ✅
  try {
    nexurejs::FileOperations::Init(env, exports);
    exports.Set("fileOperationsInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("fileOperationsInitialized", Napi::Boolean::New(env, false));
  }

  // RateLimiter - testing fixed version ✅
  try {
    nexurejs::RateLimiter::Init(env, exports);
    exports.Set("rateLimiterInitialized", Napi::Boolean::New(env, true));
  } catch (...) {
    exports.Set("rateLimiterInitialized", Napi::Boolean::New(env, false));
  }
#endif

  exports.Set("initializationPhase", Napi::Number::New(env, 10));

  // Add version information and build metadata
  exports.Set("version", Napi::String::New(env, "0.2.0"));
  exports.Set("isNative", Napi::Boolean::New(env, true));
  exports.Set("buildDate", Napi::String::New(env, __DATE__ " " __TIME__));
  exports.Set("platform", Napi::String::New(env,
#if defined(_WIN32)
    "windows"
#elif defined(__APPLE__)
    "macos"
#elif defined(__linux__)
    "linux"
#else
    "unknown"
#endif
  ));

  // Add functions for performance diagnostics
  exports.Set("getNativeMemoryUsage", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);

    // This is a placeholder - in a real implementation you would use
    // platform-specific APIs to get actual memory usage
    result.Set("rss", Napi::Number::New(env, 0));
    result.Set("heapTotal", Napi::Number::New(env, 0));
    result.Set("heapUsed", Napi::Number::New(env, 0));
    result.Set("external", Napi::Number::New(env, 0));

    return result;
  }));

  // Export isAvailable function
  exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));

  exports.Set("initializationComplete", Napi::Boolean::New(env, true));

  return exports;
}

/**
 * Cleanup resources when the module is unloaded
 */
void Cleanup(void* arg) {
    try {
        // First clean up components with their specific cleanup logic
        {
            std::lock_guard<std::mutex> lock(componentsMutex);

            for (auto& component : components) {
                try {
                    if (component.cleanup && !component.cleanupCalled) {
                        component.cleanup();
                        component.cleanupCalled = true;
                    }
                } catch (...) {
                    // Ignore exceptions during cleanup
                }
            }

            components.clear();
        }

        // Then clean up global references
        {
            std::lock_guard<std::mutex> lock(referencesMutex);

            // Mark cleanup as executed to prevent double cleanup
            if (isCleanupExecuted) return;
            isCleanupExecuted = true;

            // Free global references
            for (auto ref : globalReferences) {
                if (ref) {
                    delete ref;
                }
            }

            globalReferences.clear();
        }
    } catch (...) {
        // Ensure cleanup doesn't throw
    }
}

} // namespace nexurejs

// Create a C-style wrapper function that can be used with NAPI_MODULE
napi_value Initialize(napi_env env, napi_value exports) {
  try {
    // Convert the C types to their C++ equivalents
    Napi::Env napi_env(env);
    Napi::Object napi_exports(napi_env, exports);

    // Call our C++ Init function
    napi_exports = nexurejs::InitAll(napi_env, napi_exports);

    // Return the exports object
    return exports;
  } catch (...) {
    // If we reach here, something went very wrong
    // Can't use Napi::Error since the env might not be valid anymore
    return exports;
  }
}

// Register the module with Node.js
NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
