{
  "targets": [
    {
      "target_name": "nexurejs_native",
      "sources": [
        "src/native/main.cc",
        "src/native/http/http_parser.cc",
        "src/native/http/object_pool.cc",
        "src/native/routing/radix_router.cc",
        "src/native/json/json_processor.cc",
        "src/native/url/url_parser.cc",
        "src/native/schema/schema_validator.cc",
        "src/native/compression/compression.cc",
        "src/native/websocket/websocket.cc",
        "src/native/json/simdjson_wrapper.cpp",
        "src/native/cache/lru_cache.cc",
        "src/native/middleware/middleware_chain.cc",
        "src/native/crypto/hash_functions.cc",
        "src/native/encoding/string_encoder.cc",
        "src/native/file/file_operations.cc",
        "src/native/stream/stream_processor.cc",
        "src/native/compression/compression_engine.cc",
        "src/native/rate/rate_limiter.cc",
        "src/native/protobuf/protocol_buffers.cc",
        "src/native/validation/validation_engine.cc",
        "src/native/thread/thread_pool.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/native",
        "src/native/json",
        "<!@(node -e \"console.log(process.config.variables.node_shared ? '/usr/include/nodejs' : require('path').dirname(require.resolve('node-addon-api')) + '/../..')\")",
        "<!@(node -e \"console.log(require('path').dirname(process.execPath) + '/../include/node')\")"
      ],
      "conditions": [
        ["OS!='win'", {
          "include_dirs": [
            "/usr/local/include",
            "node_modules/simdjson/simdjson/src",
            "node_modules/simdjson/include"
          ]
        }],
        ["OS=='mac'", {
          "include_dirs": [
            "/opt/homebrew/include",
            "/usr/local/include"
          ],
          "libraries": [
            "-L/opt/homebrew/lib",
            "-luv",
            "-lcrypto",
            "-lssl"
          ]
        }]
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "cflags_cc": [
        "-Wno-error=unused-but-set-variable",
        "-Wno-error=unused-variable"
      ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "WARNING_CFLAGS": [
          "-Wno-bitwise-instead-of-logical",
          "-Wno-ambiguous-reversed-operator",
          "-Werror",
          "-Wno-error=unused-but-set-variable",
          "-Wno-error=unused-variable"
        ]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [
            "/w34100",
            "/w34189"
          ]
        }
      }
    },
    {
      "target_name": "nothing",
      "type": "static_library",
      "sources": [ "nothing.c" ],
      "configurations": {
        "Release": {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "RuntimeLibrary": 0,
              "Optimization": 3,
              "FavorSizeOrSpeed": 1,
              "InlineFunctionExpansion": 2,
              "WholeProgramOptimization": "true",
              "OmitFramePointers": "true",
              "EnableFunctionLevelLinking": "true",
              "EnableIntrinsicFunctions": "true"
            }
          }
        }
      }
    }
  ]
}
