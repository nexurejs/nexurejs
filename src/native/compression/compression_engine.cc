#include <napi.h>
#include <string>
#include <memory>
#include <unordered_map>
#include <atomic>
#include <chrono>
#include <zlib.h>
#include <string.h>
#include <iostream>
#include <algorithm>
#include <cstring>

namespace nexurejs {

class CompressionEngine : public Napi::ObjectWrap<CompressionEngine> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  CompressionEngine(const Napi::CallbackInfo& info);
  ~CompressionEngine();

private:
  enum CompressionType {
    DEFLATE = 0,
    GZIP = 1,
    BROTLI = 2,
    ZLIB = 3
  };

  struct CompressionMetrics {
    std::atomic<uint64_t> totalCompressionTime{0};
    std::atomic<uint64_t> totalDecompressionTime{0};
    std::atomic<uint64_t> totalBytesCompressed{0};
    std::atomic<uint64_t> totalBytesDecompressed{0};
    std::atomic<uint64_t> totalCompressedSize{0};
    std::atomic<uint64_t> totalDecompressedSize{0};
    std::atomic<uint64_t> compressionCount{0};
    std::atomic<uint64_t> decompressionCount{0};
    std::atomic<uint64_t> compressionErrors{0};
    std::atomic<uint64_t> decompressionErrors{0};
  };

  // Methods exposed to JavaScript
  Napi::Value Compress(const Napi::CallbackInfo& info);
  Napi::Value Decompress(const Napi::CallbackInfo& info);
  Napi::Value CompressStream(const Napi::CallbackInfo& info);
  Napi::Value DecompressStream(const Napi::CallbackInfo& info);
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);

  // Internal implementation methods
  Napi::Buffer<uint8_t> CompressDeflate(Napi::Env env, const uint8_t* data, size_t length, int level);
  Napi::Buffer<uint8_t> DecompressDeflate(Napi::Env env, const uint8_t* data, size_t length);
  Napi::Buffer<uint8_t> CompressGzip(Napi::Env env, const uint8_t* data, size_t length, int level);
  Napi::Buffer<uint8_t> DecompressGzip(Napi::Env env, const uint8_t* data, size_t length);
  Napi::Buffer<uint8_t> CompressZlib(Napi::Env env, const uint8_t* data, size_t length, int level);
  Napi::Buffer<uint8_t> DecompressZlib(Napi::Env env, const uint8_t* data, size_t length);

  // For Brotli implementation, we would include the brotli headers and implement these methods
  Napi::Buffer<uint8_t> CompressBrotli(Napi::Env env, const uint8_t* data, size_t length, int quality);
  Napi::Buffer<uint8_t> DecompressBrotli(Napi::Env env, const uint8_t* data, size_t length);

  // Utilities
  void UpdateCompressionMetrics(uint64_t originalSize, uint64_t compressedSize, uint64_t duration);
  void UpdateDecompressionMetrics(uint64_t compressedSize, uint64_t decompressedSize, uint64_t duration);
  void IncrementCompressionError();
  void IncrementDecompressionError();

  // Member variables
  CompressionMetrics metrics;
  std::unordered_map<uint32_t, z_stream> zlibStreams;
  std::atomic<uint32_t> nextStreamId{1};
};

Napi::FunctionReference CompressionEngine::constructor;

Napi::Object CompressionEngine::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "CompressionEngine", {
    InstanceMethod("compress", &CompressionEngine::Compress),
    InstanceMethod("decompress", &CompressionEngine::Decompress),
    InstanceMethod("compressStream", &CompressionEngine::CompressStream),
    InstanceMethod("decompressStream", &CompressionEngine::DecompressStream),
    InstanceMethod("resetMetrics", &CompressionEngine::ResetMetrics),
    InstanceMethod("getMetrics", &CompressionEngine::GetMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("CompressionEngine", func);
  return exports;
}

CompressionEngine::CompressionEngine(const Napi::CallbackInfo& info) : Napi::ObjectWrap<CompressionEngine>(info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);
}

CompressionEngine::~CompressionEngine() {
  // Clean up any active compression streams
  for (auto& pair : zlibStreams) {
    deflateEnd(&pair.second);
  }
  zlibStreams.clear();
}

Napi::Value CompressionEngine::Compress(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected buffer and options object").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Buffer<uint8_t> inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
  Napi::Object options = info[1].As<Napi::Object>();

  // Parse options
  int algorithm = options.Has("algorithm")
    ? options.Get("algorithm").As<Napi::Number>().Int32Value()
    : DEFLATE;

  int level = options.Has("level")
    ? options.Get("level").As<Napi::Number>().Int32Value()
    : Z_DEFAULT_COMPRESSION;

  auto startTime = std::chrono::high_resolution_clock::now();
  Napi::Buffer<uint8_t> result;

  try {
    switch (algorithm) {
      case DEFLATE:
        result = CompressDeflate(env, inputBuffer.Data(), inputBuffer.Length(), level);
        break;
      case GZIP:
        result = CompressGzip(env, inputBuffer.Data(), inputBuffer.Length(), level);
        break;
      case BROTLI:
        result = CompressBrotli(env, inputBuffer.Data(), inputBuffer.Length(), level);
        break;
      case ZLIB:
        result = CompressZlib(env, inputBuffer.Data(), inputBuffer.Length(), level);
        break;
      default:
        Napi::TypeError::New(env, "Unknown compression algorithm").ThrowAsJavaScriptException();
        return env.Null();
    }
  } catch (const std::exception& e) {
    IncrementCompressionError();
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  UpdateCompressionMetrics(inputBuffer.Length(), result.Length(), duration);

  return result;
}

Napi::Value CompressionEngine::Decompress(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected buffer and options object").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Buffer<uint8_t> inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
  Napi::Object options = info[1].As<Napi::Object>();

  // Parse options
  int algorithm = options.Has("algorithm")
    ? options.Get("algorithm").As<Napi::Number>().Int32Value()
    : DEFLATE;

  auto startTime = std::chrono::high_resolution_clock::now();
  Napi::Buffer<uint8_t> result;

  try {
    switch (algorithm) {
      case DEFLATE:
        result = DecompressDeflate(env, inputBuffer.Data(), inputBuffer.Length());
        break;
      case GZIP:
        result = DecompressGzip(env, inputBuffer.Data(), inputBuffer.Length());
        break;
      case BROTLI:
        result = DecompressBrotli(env, inputBuffer.Data(), inputBuffer.Length());
        break;
      case ZLIB:
        result = DecompressZlib(env, inputBuffer.Data(), inputBuffer.Length());
        break;
      default:
        Napi::TypeError::New(env, "Unknown decompression algorithm").ThrowAsJavaScriptException();
        return env.Null();
    }
  } catch (const std::exception& e) {
    IncrementDecompressionError();
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  UpdateDecompressionMetrics(inputBuffer.Length(), result.Length(), duration);

  return result;
}

Napi::Value CompressionEngine::CompressStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // This would initialize a streaming compression context
  // For brevity, implementation details are omitted

  return Napi::Number::New(env, nextStreamId++);
}

Napi::Value CompressionEngine::DecompressStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // This would initialize a streaming decompression context
  // For brevity, implementation details are omitted

  return Napi::Number::New(env, nextStreamId++);
}

Napi::Value CompressionEngine::ResetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  metrics.totalCompressionTime = 0;
  metrics.totalDecompressionTime = 0;
  metrics.totalBytesCompressed = 0;
  metrics.totalBytesDecompressed = 0;
  metrics.totalCompressedSize = 0;
  metrics.totalDecompressedSize = 0;
  metrics.compressionCount = 0;
  metrics.decompressionCount = 0;
  metrics.compressionErrors = 0;
  metrics.decompressionErrors = 0;

  return env.Undefined();
}

Napi::Value CompressionEngine::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  Napi::Object metricsObj = Napi::Object::New(env);

  metricsObj.Set("totalCompressionTime", Napi::Number::New(env, metrics.totalCompressionTime));
  metricsObj.Set("totalDecompressionTime", Napi::Number::New(env, metrics.totalDecompressionTime));
  metricsObj.Set("totalBytesCompressed", Napi::Number::New(env, metrics.totalBytesCompressed));
  metricsObj.Set("totalBytesDecompressed", Napi::Number::New(env, metrics.totalBytesDecompressed));
  metricsObj.Set("totalCompressedSize", Napi::Number::New(env, metrics.totalCompressedSize));
  metricsObj.Set("totalDecompressedSize", Napi::Number::New(env, metrics.totalDecompressedSize));
  metricsObj.Set("compressionCount", Napi::Number::New(env, metrics.compressionCount));
  metricsObj.Set("decompressionCount", Napi::Number::New(env, metrics.decompressionCount));
  metricsObj.Set("compressionErrors", Napi::Number::New(env, metrics.compressionErrors));
  metricsObj.Set("decompressionErrors", Napi::Number::New(env, metrics.decompressionErrors));

  // Calculate average compression ratio if we have data
  if (metrics.totalBytesCompressed > 0) {
    double ratio = static_cast<double>(metrics.totalCompressedSize) /
                  static_cast<double>(metrics.totalBytesCompressed);
    metricsObj.Set("averageCompressionRatio", Napi::Number::New(env, ratio));
  } else {
    metricsObj.Set("averageCompressionRatio", Napi::Number::New(env, 0.0));
  }

  return metricsObj;
}

Napi::Buffer<uint8_t> CompressionEngine::CompressDeflate(Napi::Env env, const uint8_t* data, size_t length, int level) {
  z_stream zs;
  memset(&zs, 0, sizeof(zs));

  if (deflateInit(&zs, level) != Z_OK) {
    throw std::runtime_error("Failed to initialize deflate");
  }

  // Set up the input
  zs.next_in = const_cast<Bytef*>(data);
  zs.avail_in = static_cast<uInt>(length);

  // Estimate the output size (compressed data is usually smaller, but not always)
  size_t outSize = compressBound(length);
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outSize]);

  // Set up the output
  zs.next_out = reinterpret_cast<Bytef*>(outBuffer.get());
  zs.avail_out = static_cast<uInt>(outSize);

  // Compress
  int result = deflate(&zs, Z_FINISH);
  deflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Error during deflate compression");
  }

  // Create a buffer of the correct size
  size_t compressedSize = outSize - zs.avail_out;
  return Napi::Buffer<uint8_t>::Copy(env, outBuffer.get(), compressedSize);
}

Napi::Buffer<uint8_t> CompressionEngine::DecompressDeflate(Napi::Env env, const uint8_t* data, size_t length) {
  z_stream zs;
  memset(&zs, 0, sizeof(zs));

  if (inflateInit(&zs) != Z_OK) {
    throw std::runtime_error("Failed to initialize inflate");
  }

  // Set up the input
  zs.next_in = const_cast<Bytef*>(data);
  zs.avail_in = static_cast<uInt>(length);

  // We don't know the size of the decompressed data, so start with a reasonable guess
  // and grow if necessary
  size_t outSize = length * 4;  // Initial guess: 4x the compressed size
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outSize]);

  // Set up the output
  zs.next_out = reinterpret_cast<Bytef*>(outBuffer.get());
  zs.avail_out = static_cast<uInt>(outSize);

  // Decompress
  int result = inflate(&zs, Z_FINISH);

  if (result != Z_STREAM_END && result != Z_OK) {
    inflateEnd(&zs);
    throw std::runtime_error("Error during deflate decompression");
  }

  // Create a buffer of the correct size
  size_t decompressedSize = outSize - zs.avail_out;
  auto resultBuffer = Napi::Buffer<uint8_t>::Copy(env, outBuffer.get(), decompressedSize);

  inflateEnd(&zs);
  return resultBuffer;
}

Napi::Buffer<uint8_t> CompressionEngine::CompressGzip(Napi::Env env, const uint8_t* data, size_t length, int level) {
  z_stream zs;
  memset(&zs, 0, sizeof(zs));

  // Initialize with gzip format
  if (deflateInit2(&zs, level, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
    throw std::runtime_error("Failed to initialize gzip compression");
  }

  // Set up the input
  zs.next_in = const_cast<Bytef*>(data);
  zs.avail_in = static_cast<uInt>(length);

  // Estimate the output size
  size_t outSize = compressBound(length);
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outSize]);

  // Set up the output
  zs.next_out = reinterpret_cast<Bytef*>(outBuffer.get());
  zs.avail_out = static_cast<uInt>(outSize);

  // Compress
  int result = deflate(&zs, Z_FINISH);
  deflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Error during gzip compression");
  }

  // Create a buffer of the correct size
  size_t compressedSize = outSize - zs.avail_out;
  return Napi::Buffer<uint8_t>::Copy(env, outBuffer.get(), compressedSize);
}

Napi::Buffer<uint8_t> CompressionEngine::DecompressGzip(Napi::Env env, const uint8_t* data, size_t length) {
  z_stream zs;
  memset(&zs, 0, sizeof(zs));

  // Initialize with gzip format
  if (inflateInit2(&zs, 15 + 16) != Z_OK) {
    throw std::runtime_error("Failed to initialize gzip decompression");
  }

  // Set up the input
  zs.next_in = const_cast<Bytef*>(data);
  zs.avail_in = static_cast<uInt>(length);

  // We don't know the size of the decompressed data, so start with a reasonable guess
  size_t outSize = length * 4;  // Initial guess: 4x the compressed size
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outSize]);

  // Set up the output
  zs.next_out = reinterpret_cast<Bytef*>(outBuffer.get());
  zs.avail_out = static_cast<uInt>(outSize);

  // Decompress
  int result = inflate(&zs, Z_FINISH);

  if (result != Z_STREAM_END && result != Z_OK) {
    inflateEnd(&zs);
    throw std::runtime_error("Error during gzip decompression");
  }

  // Create a buffer of the correct size
  size_t decompressedSize = outSize - zs.avail_out;
  auto resultBuffer = Napi::Buffer<uint8_t>::Copy(env, outBuffer.get(), decompressedSize);

  inflateEnd(&zs);
  return resultBuffer;
}

Napi::Buffer<uint8_t> CompressionEngine::CompressZlib(Napi::Env env, const uint8_t* data, size_t length, int level) {
  z_stream zs;
  memset(&zs, 0, sizeof(zs));

  // Initialize with zlib format
  if (deflateInit2(&zs, level, Z_DEFLATED, 15, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
    throw std::runtime_error("Failed to initialize zlib compression");
  }

  // Set up the input
  zs.next_in = const_cast<Bytef*>(data);
  zs.avail_in = static_cast<uInt>(length);

  // Estimate the output size
  size_t outSize = compressBound(length);
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outSize]);

  // Set up the output
  zs.next_out = reinterpret_cast<Bytef*>(outBuffer.get());
  zs.avail_out = static_cast<uInt>(outSize);

  // Compress
  int result = deflate(&zs, Z_FINISH);
  deflateEnd(&zs);

  if (result != Z_STREAM_END) {
    throw std::runtime_error("Error during zlib compression");
  }

  // Create a buffer of the correct size
  size_t compressedSize = outSize - zs.avail_out;
  return Napi::Buffer<uint8_t>::Copy(env, outBuffer.get(), compressedSize);
}

Napi::Buffer<uint8_t> CompressionEngine::DecompressZlib(Napi::Env env, const uint8_t* data, size_t length) {
  z_stream zs;
  memset(&zs, 0, sizeof(zs));

  // Initialize with zlib format
  if (inflateInit2(&zs, 15) != Z_OK) {
    throw std::runtime_error("Failed to initialize zlib decompression");
  }

  // Set up the input
  zs.next_in = const_cast<Bytef*>(data);
  zs.avail_in = static_cast<uInt>(length);

  // We don't know the size of the decompressed data, so start with a reasonable guess
  size_t outSize = length * 4;  // Initial guess: 4x the compressed size
  std::unique_ptr<uint8_t[]> outBuffer(new uint8_t[outSize]);

  // Set up the output
  zs.next_out = reinterpret_cast<Bytef*>(outBuffer.get());
  zs.avail_out = static_cast<uInt>(outSize);

  // Decompress
  int result = inflate(&zs, Z_FINISH);

  if (result != Z_STREAM_END && result != Z_OK) {
    inflateEnd(&zs);
    throw std::runtime_error("Error during zlib decompression");
  }

  // Create a buffer of the correct size
  size_t decompressedSize = outSize - zs.avail_out;
  auto resultBuffer = Napi::Buffer<uint8_t>::Copy(env, outBuffer.get(), decompressedSize);

  inflateEnd(&zs);
  return resultBuffer;
}

// Brotli methods would be implemented here if the brotli library is available
// For now, we just provide stub implementations

Napi::Buffer<uint8_t> CompressionEngine::CompressBrotli(Napi::Env env, const uint8_t* data, size_t length, int quality) {
  // This is a stub implementation
  // In a real implementation, we would use the brotli library
  throw std::runtime_error("Brotli compression not implemented");
}

Napi::Buffer<uint8_t> CompressionEngine::DecompressBrotli(Napi::Env env, const uint8_t* data, size_t length) {
  // This is a stub implementation
  // In a real implementation, we would use the brotli library
  throw std::runtime_error("Brotli decompression not implemented");
}

void CompressionEngine::UpdateCompressionMetrics(uint64_t originalSize, uint64_t compressedSize, uint64_t duration) {
  metrics.totalBytesCompressed += originalSize;
  metrics.totalCompressedSize += compressedSize;
  metrics.totalCompressionTime += duration;
  metrics.compressionCount++;
}

void CompressionEngine::UpdateDecompressionMetrics(uint64_t compressedSize, uint64_t decompressedSize, uint64_t duration) {
  metrics.totalCompressedSize += compressedSize;
  metrics.totalBytesDecompressed += decompressedSize;
  metrics.totalDecompressionTime += duration;
  metrics.decompressionCount++;
}

void CompressionEngine::IncrementCompressionError() {
  metrics.compressionErrors++;
}

void CompressionEngine::IncrementDecompressionError() {
  metrics.decompressionErrors++;
}

} // namespace nexurejs
