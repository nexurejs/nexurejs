{
  "targets": [
    {
      "target_name": "nexurejs_native",
      "sources": [
        "src/native/main.cc",
        "src/native/encoding/string_encoder.cc",
        "src/native/memory/memory_manager.cc",
        "src/native/memory/advanced_memory_optimizer_simple.cc",
        "src/native/simd/advanced_simd_profiler.cc",
        "src/native/thread/thread_pool.cc",
        "src/native/validation/validation_engine.cc",
        "src/native/compression/compression_engine.cc",
        "src/native/stream/stream_processor.cc",
        "src/native/rate/rate_limiter.cc",
        "src/native/url/url_parser.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/native",
        "src/native/http",
        "src/native/encoding",
        "src/native/memory",
        "src/native/simd",
        "src/native/thread",
        "src/native/validation",
        "src/native/compression",
        "src/native/stream",
        "src/native/rate",
        "src/native/url"
      ],
      "libraries": [
        "-lz"
      ],
      "conditions": [
        ["OS!='win'", {
          "cflags_cc": [
            "-O3",
            "-ffast-math",
            "-funroll-loops",
            "-fomit-frame-pointer",
            "-finline-functions",
            "-flto",
            "-fvectorize",
            "-Wno-unused-parameter",
            "-Wno-sign-compare",
            "-Wno-unused-variable"
          ]
        }],
        ["OS!='win' and target_arch=='x64'", {
          "cflags_cc": [
            "-march=native",
            "-mtune=native",
            "-mavx2",
            "-msse4.2"
          ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15",
            "WARNING_CFLAGS": [
              "-Wno-unused-parameter",
              "-Wno-sign-compare",
              "-Wno-unused-variable"
            ]
          }
        }],
        ["OS=='win'", {
          "libraries": [
            "zlib.lib"
          ]
        }]
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NEXURE_OPTIMIZED=1",
        "ENABLE_SIMD=1",
        "ENABLE_VECTORIZATION=1",
        "ENABLE_ADVANCED_MEMORY=1"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ]
    }
  ]
}
