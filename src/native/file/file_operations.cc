#include <napi.h>
#include <string>
#include <memory>
#include <chrono>
#include <fstream>
#include <vector>
#include <atomic>
#include <sys/stat.h>

namespace nexurejs {

/**
 * FileOperations - FIXED VERSION
 * High-performance file operations with proper Node.js integration
 */
class FileOperations : public Napi::ObjectWrap<FileOperations> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  FileOperations(const Napi::CallbackInfo& info);
  ~FileOperations();

private:
  // Metrics
  std::atomic<uint64_t> readCount_{0};
  std::atomic<uint64_t> writeCount_{0};
  std::atomic<uint64_t> totalReadBytes_{0};
  std::atomic<uint64_t> totalWriteBytes_{0};
  std::atomic<uint64_t> totalOperationTimeUs_{0};

  // Buffer pool for reuse
  static constexpr size_t BUFFER_POOL_SIZE = 10;
  static constexpr size_t DEFAULT_BUFFER_SIZE = 65536; // 64KB
  struct BufferEntry {
    std::vector<char> buffer;
    bool inUse = false;
  };
  std::vector<BufferEntry> bufferPool_;

  // Exposed methods
  Napi::Value ReadFileSync(const Napi::CallbackInfo& info);
  Napi::Value WriteFileSync(const Napi::CallbackInfo& info);
  Napi::Value AppendFileSync(const Napi::CallbackInfo& info);
  Napi::Value ExistsSync(const Napi::CallbackInfo& info);
  Napi::Value GetStatsSync(const Napi::CallbackInfo& info);
  Napi::Value CopyFileSync(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value ReadFileFast(const Napi::CallbackInfo& info);

  // Helper methods
  std::vector<char>* getBuffer();
  void releaseBuffer(std::vector<char>* buffer);
};

// Static members
Napi::FunctionReference FileOperations::constructor;

// Initialize the module
Napi::Object FileOperations::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "FileOperations", {
    InstanceMethod("readFileSync", &FileOperations::ReadFileSync),
    InstanceMethod("writeFileSync", &FileOperations::WriteFileSync),
    InstanceMethod("appendFileSync", &FileOperations::AppendFileSync),
    InstanceMethod("existsSync", &FileOperations::ExistsSync),
    InstanceMethod("getStatsSync", &FileOperations::GetStatsSync),
    InstanceMethod("copyFileSync", &FileOperations::CopyFileSync),
    InstanceMethod("getMetrics", &FileOperations::GetMetrics),
    InstanceMethod("readFileFast", &FileOperations::ReadFileFast),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("FileOperations", func);
  return exports;
}

// Constructor
FileOperations::FileOperations(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<FileOperations>(info) {
  // Initialize buffer pool
  bufferPool_.resize(BUFFER_POOL_SIZE);
  for (auto& entry : bufferPool_) {
    entry.buffer.reserve(DEFAULT_BUFFER_SIZE);
  }
}

// Destructor
FileOperations::~FileOperations() {
  // Cleanup handled by destructors
}

// Get a buffer from the pool
std::vector<char>* FileOperations::getBuffer() {
  for (auto& entry : bufferPool_) {
    if (!entry.inUse) {
      entry.inUse = true;
      entry.buffer.clear();
      return &entry.buffer;
    }
  }
  // No free buffer, allocate a new one
  return new std::vector<char>();
}

// Release a buffer back to the pool
void FileOperations::releaseBuffer(std::vector<char>* buffer) {
  for (auto& entry : bufferPool_) {
    if (&entry.buffer == buffer) {
      entry.inUse = false;
      return;
    }
  }
  // Not from pool, delete it
  delete buffer;
}

// Read file synchronously
Napi::Value FileOperations::ReadFileSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Check encoding option
  std::string encoding = "";
  if (info.Length() >= 2 && info[1].IsString()) {
    encoding = info[1].As<Napi::String>().Utf8Value();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Open file
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
      Napi::Error::New(env, "ENOENT: no such file or directory, open '" + path + "'").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Get file size
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);

    // Read file content
    if (encoding == "utf8" || encoding == "utf-8") {
      // Return as string
      std::string content(size, '\0');
      file.read(&content[0], size);

      readCount_++;
      totalReadBytes_ += size;

      auto endTime = std::chrono::high_resolution_clock::now();
      totalOperationTimeUs_ += std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

      return Napi::String::New(env, content);
    } else {
      // Return as buffer
      Napi::Buffer<char> buffer = Napi::Buffer<char>::New(env, size);
      file.read(buffer.Data(), size);

      readCount_++;
      totalReadBytes_ += size;

      auto endTime = std::chrono::high_resolution_clock::now();
      totalOperationTimeUs_ += std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

      return buffer;
    }
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Write file synchronously
Napi::Value FileOperations::WriteFileSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Path and data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    std::ofstream file(path, std::ios::binary | std::ios::trunc);
    if (!file.is_open()) {
      Napi::Error::New(env, "Failed to open file for writing: " + path).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    size_t bytesWritten = 0;

    if (info[1].IsString()) {
      std::string data = info[1].As<Napi::String>().Utf8Value();
      file.write(data.c_str(), data.length());
      bytesWritten = data.length();
    } else if (info[1].IsBuffer()) {
      Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
      file.write(buffer.Data(), buffer.Length());
      bytesWritten = buffer.Length();
    } else {
      Napi::TypeError::New(env, "String or Buffer expected for data").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    file.close();

    writeCount_++;
    totalWriteBytes_ += bytesWritten;

    auto endTime = std::chrono::high_resolution_clock::now();
    totalOperationTimeUs_ += std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    return env.Undefined();
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Append to file synchronously
Napi::Value FileOperations::AppendFileSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Path and data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    std::ofstream file(path, std::ios::binary | std::ios::app);
    if (!file.is_open()) {
      Napi::Error::New(env, "Failed to open file for appending: " + path).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    size_t bytesWritten = 0;

    if (info[1].IsString()) {
      std::string data = info[1].As<Napi::String>().Utf8Value();
      file.write(data.c_str(), data.length());
      bytesWritten = data.length();
    } else if (info[1].IsBuffer()) {
      Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
      file.write(buffer.Data(), buffer.Length());
      bytesWritten = buffer.Length();
    } else {
      Napi::TypeError::New(env, "String or Buffer expected for data").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    file.close();

    writeCount_++;
    totalWriteBytes_ += bytesWritten;

    auto endTime = std::chrono::high_resolution_clock::now();
    totalOperationTimeUs_ += std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    return env.Undefined();
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Check if file exists
Napi::Value FileOperations::ExistsSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();

  struct stat buffer;
  return Napi::Boolean::New(env, stat(path.c_str(), &buffer) == 0);
}

// Get file stats
Napi::Value FileOperations::GetStatsSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();

  struct stat fileStat;
  if (stat(path.c_str(), &fileStat) != 0) {
    Napi::Error::New(env, "ENOENT: no such file or directory, stat '" + path + "'").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Object stats = Napi::Object::New(env);
  stats.Set("size", Napi::Number::New(env, fileStat.st_size));
  stats.Set("isFile", Napi::Boolean::New(env, S_ISREG(fileStat.st_mode)));
  stats.Set("isDirectory", Napi::Boolean::New(env, S_ISDIR(fileStat.st_mode)));
  stats.Set("mode", Napi::Number::New(env, fileStat.st_mode));
  stats.Set("atime", Napi::Date::New(env, fileStat.st_atime * 1000));
  stats.Set("mtime", Napi::Date::New(env, fileStat.st_mtime * 1000));
  stats.Set("ctime", Napi::Date::New(env, fileStat.st_ctime * 1000));

  return stats;
}

// Copy file synchronously
Napi::Value FileOperations::CopyFileSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Source and destination paths expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string srcPath = info[0].As<Napi::String>().Utf8Value();
  std::string destPath = info[1].As<Napi::String>().Utf8Value();

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    std::ifstream src(srcPath, std::ios::binary);
    if (!src.is_open()) {
      Napi::Error::New(env, "ENOENT: no such file or directory, open '" + srcPath + "'").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    std::ofstream dest(destPath, std::ios::binary);
    if (!dest.is_open()) {
      Napi::Error::New(env, "Failed to open destination file: " + destPath).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Use buffer from pool
    auto* buffer = getBuffer();
    buffer->resize(DEFAULT_BUFFER_SIZE);

    size_t totalBytes = 0;
    while (src.good()) {
      src.read(buffer->data(), buffer->size());
      std::streamsize bytesRead = src.gcount();
      if (bytesRead > 0) {
        dest.write(buffer->data(), bytesRead);
        totalBytes += bytesRead;
      }
    }

    releaseBuffer(buffer);

    readCount_++;
    writeCount_++;
    totalReadBytes_ += totalBytes;
    totalWriteBytes_ += totalBytes;

    auto endTime = std::chrono::high_resolution_clock::now();
    totalOperationTimeUs_ += std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    return env.Undefined();
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Fast file reading with zero-copy optimization
Napi::Value FileOperations::ReadFileFast(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Get file size first
    struct stat fileStat;
    if (stat(path.c_str(), &fileStat) != 0) {
      Napi::Error::New(env, "ENOENT: no such file or directory, open '" + path + "'").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    size_t fileSize = fileStat.st_size;

    // Allocate buffer exactly the size we need
    Napi::Buffer<char> buffer = Napi::Buffer<char>::New(env, fileSize);

    // Read entire file in one go
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
      Napi::Error::New(env, "Failed to open file: " + path).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    file.read(buffer.Data(), fileSize);

    readCount_++;
    totalReadBytes_ += fileSize;

    auto endTime = std::chrono::high_resolution_clock::now();
    totalOperationTimeUs_ += std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    return buffer;
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Get metrics
Napi::Value FileOperations::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  metrics.Set("readCount", Napi::Number::New(env, readCount_.load()));
  metrics.Set("writeCount", Napi::Number::New(env, writeCount_.load()));
  metrics.Set("totalReadBytes", Napi::Number::New(env, totalReadBytes_.load()));
  metrics.Set("totalWriteBytes", Napi::Number::New(env, totalWriteBytes_.load()));
  metrics.Set("totalOperationTimeMs", Napi::Number::New(env, totalOperationTimeUs_.load() / 1000.0));

  uint64_t totalOps = readCount_ + writeCount_;
  if (totalOps > 0) {
    double avgTimeUs = static_cast<double>(totalOperationTimeUs_.load()) / totalOps;
    metrics.Set("averageOperationTimeUs", Napi::Number::New(env, avgTimeUs));
    metrics.Set("operationsPerSecond", Napi::Number::New(env, 1000000.0 / avgTimeUs));
  }

  return metrics;
}

} // namespace nexurejs
