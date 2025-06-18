#include <napi.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <fstream>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <cstring>

/**
 * NativeFileOps - High-performance file operations
 * Provides memory-mapped file operations and buffered I/O
 */
class FileOperations : public Napi::ObjectWrap<FileOperations> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  FileOperations(const Napi::CallbackInfo& info);
  ~FileOperations();

private:
  // Metrics
  double readTime_ = 0;
  size_t readCount_ = 0;
  double writeTime_ = 0;
  size_t writeCount_ = 0;
  double mmapTime_ = 0;
  size_t mmapCount_ = 0;

  // Reference to metrics object
  Napi::ObjectReference metricsObject_;

  // Memory mapped file data
  struct MappedFile {
    int fd = -1;
    void* data = nullptr;
    size_t size = 0;
    std::string path;
  };

  // Store mapped files by ID
  std::vector<MappedFile> mappedFiles_;

  // Exposed methods
  Napi::Value ReadFile(const Napi::CallbackInfo& info);
  Napi::Value WriteFile(const Napi::CallbackInfo& info);
  Napi::Value AppendFile(const Napi::CallbackInfo& info);
  Napi::Value MapFile(const Napi::CallbackInfo& info);
  Napi::Value UnmapFile(const Napi::CallbackInfo& info);
  Napi::Value ReadFromMap(const Napi::CallbackInfo& info);
  Napi::Value FileExists(const Napi::CallbackInfo& info);
  Napi::Value GetFileSize(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

  // Internal methods
  void updateMetrics();
  void cleanupMappedFiles();
};

// Initialize the module
Napi::Object FileOperations::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "FileOperations", {
    InstanceMethod("readFile", &FileOperations::ReadFile),
    InstanceMethod("writeFile", &FileOperations::WriteFile),
    InstanceMethod("appendFile", &FileOperations::AppendFile),
    InstanceMethod("mapFile", &FileOperations::MapFile),
    InstanceMethod("unmapFile", &FileOperations::UnmapFile),
    InstanceMethod("readFromMap", &FileOperations::ReadFromMap),
    InstanceMethod("fileExists", &FileOperations::FileExists),
    InstanceMethod("getFileSize", &FileOperations::GetFileSize),
    InstanceMethod("getMetrics", &FileOperations::GetMetrics),
    InstanceMethod("resetMetrics", &FileOperations::ResetMetrics),
  });

  Napi::FunctionReference* constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);

  exports.Set("FileOperations", func);
  return exports;
}

// Constructor
FileOperations::FileOperations(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<FileOperations>(info) {
  Napi::Env env = info.Env();

  // Initialize metrics object
  Napi::Object metrics = Napi::Object::New(env);
  metrics.Set("readTime", Napi::Number::New(env, 0));
  metrics.Set("readCount", Napi::Number::New(env, 0));
  metrics.Set("writeTime", Napi::Number::New(env, 0));
  metrics.Set("writeCount", Napi::Number::New(env, 0));
  metrics.Set("mmapTime", Napi::Number::New(env, 0));
  metrics.Set("mmapCount", Napi::Number::New(env, 0));
  metricsObject_ = Napi::Persistent(metrics);
}

// Destructor
FileOperations::~FileOperations() {
  cleanupMappedFiles();
}

// Clean up memory mapped files
void FileOperations::cleanupMappedFiles() {
  for (auto& file : mappedFiles_) {
    if (file.data != nullptr && file.size > 0) {
      munmap(file.data, file.size);
      file.data = nullptr;
    }

    if (file.fd >= 0) {
      close(file.fd);
      file.fd = -1;
    }
  }

  mappedFiles_.clear();
}

// Read file
Napi::Value FileOperations::ReadFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file path
  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Get buffer size if provided
  size_t bufferSize = 8192;  // Default 8KB buffer
  if (info.Length() >= 2 && info[1].IsNumber()) {
    bufferSize = info[1].As<Napi::Number>().Uint32Value();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Check if file exists
    struct stat statBuf;
    if (stat(path.c_str(), &statBuf) != 0) {
      std::string error = "Error accessing file: " + std::string(strerror(errno));
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Get file size
    size_t fileSize = static_cast<size_t>(statBuf.st_size);

    // Open file
    std::ifstream file(path, std::ios::binary);
    if (!file) {
      Napi::Error::New(env, "Failed to open file for reading").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Allocate buffer
    Napi::Buffer<char> buffer = Napi::Buffer<char>::New(env, fileSize);

    // Read file into buffer in chunks using the specified buffer size
    char* readBuffer = new char[bufferSize];
    size_t totalBytesRead = 0;

    while (totalBytesRead < fileSize && file.good()) {
      size_t bytesToRead = std::min(bufferSize, fileSize - totalBytesRead);
      file.read(readBuffer, bytesToRead);
      size_t bytesRead = file.gcount();

      // Copy to the output buffer
      std::memcpy(buffer.Data() + totalBytesRead, readBuffer, bytesRead);
      totalBytesRead += bytesRead;
    }

    // Clean up
    delete[] readBuffer;

    // Close file
    file.close();

    // Stop timing
    auto endTime = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
    readTime_ += duration;
    readCount_++;
    updateMetrics();

    // Return buffer
    return buffer;
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Write file
Napi::Value FileOperations::WriteFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 2 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Path and data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file path
  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Get data
  std::string data;
  if (info[1].IsString()) {
    data = info[1].As<Napi::String>().Utf8Value();
  } else if (info[1].IsBuffer()) {
    Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
    data = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected for data").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Open file for writing
    std::ofstream file(path, std::ios::binary);
    if (!file) {
      Napi::Error::New(env, "Failed to open file for writing").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Write data
    file.write(data.c_str(), data.length());

    // Close file
    file.close();

    // Stop timing
    auto endTime = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
    writeTime_ += duration;
    writeCount_++;
    updateMetrics();

    // Return true
    return Napi::Boolean::New(env, true);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Append to file
Napi::Value FileOperations::AppendFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 2 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Path and data expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file path
  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Get data
  std::string data;
  if (info[1].IsString()) {
    data = info[1].As<Napi::String>().Utf8Value();
  } else if (info[1].IsBuffer()) {
    Napi::Buffer<char> buffer = info[1].As<Napi::Buffer<char>>();
    data = std::string(buffer.Data(), buffer.Length());
  } else {
    Napi::TypeError::New(env, "String or Buffer expected for data").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Open file for appending
    std::ofstream file(path, std::ios::binary | std::ios::app);
    if (!file) {
      Napi::Error::New(env, "Failed to open file for appending").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Write data
    file.write(data.c_str(), data.length());

    // Close file
    file.close();

    // Stop timing
    auto endTime = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
    writeTime_ += duration;
    writeCount_++;
    updateMetrics();

    // Return true
    return Napi::Boolean::New(env, true);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Memory map a file
Napi::Value FileOperations::MapFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file path
  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Start timing
  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Open file
    int fd = open(path.c_str(), O_RDONLY);
    if (fd == -1) {
      std::string error = "Error opening file: " + std::string(strerror(errno));
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Get file size
    struct stat statBuf;
    if (fstat(fd, &statBuf) == -1) {
      close(fd);
      std::string error = "Error getting file size: " + std::string(strerror(errno));
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    size_t fileSize = static_cast<size_t>(statBuf.st_size);

    // Map file into memory
    void* data = mmap(nullptr, fileSize, PROT_READ, MAP_PRIVATE, fd, 0);
    if (data == MAP_FAILED) {
      close(fd);
      std::string error = "Error mapping file: " + std::string(strerror(errno));
      Napi::Error::New(env, error).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Store mapped file
    size_t id = mappedFiles_.size();
    mappedFiles_.push_back({fd, data, fileSize, path});

    // Stop timing
    auto endTime = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double, std::milli>(endTime - startTime).count();
    mmapTime_ += duration;
    mmapCount_++;
    updateMetrics();

    // Create result object
    Napi::Object result = Napi::Object::New(env);
    result.Set("id", Napi::Number::New(env, id));
    result.Set("size", Napi::Number::New(env, fileSize));
    result.Set("path", Napi::String::New(env, path));

    return result;
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

// Unmap a file
Napi::Value FileOperations::UnmapFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Number expected for file ID").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file ID
  size_t id = info[0].As<Napi::Number>().Uint32Value();

  // Check if ID is valid
  if (id >= mappedFiles_.size() || mappedFiles_[id].data == nullptr) {
    Napi::Error::New(env, "Invalid file ID or file already unmapped").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get mapped file
  MappedFile& file = mappedFiles_[id];

  // Unmap file
  if (munmap(file.data, file.size) == -1) {
    std::string error = "Error unmapping file: " + std::string(strerror(errno));
    Napi::Error::New(env, error).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Close file descriptor
  close(file.fd);

  // Mark as unmapped
  file.data = nullptr;
  file.fd = -1;
  file.size = 0;

  // Return true
  return Napi::Boolean::New(env, true);
}

// Read from mapped file
Napi::Value FileOperations::ReadFromMap(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber()) {
    Napi::TypeError::New(env, "Expected: file ID, offset, length").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get parameters
  size_t id = info[0].As<Napi::Number>().Uint32Value();
  size_t offset = info[1].As<Napi::Number>().Uint32Value();
  size_t length = info[2].As<Napi::Number>().Uint32Value();

  // Check if ID is valid
  if (id >= mappedFiles_.size() || mappedFiles_[id].data == nullptr) {
    Napi::Error::New(env, "Invalid file ID or file not mapped").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get mapped file
  const MappedFile& file = mappedFiles_[id];

  // Check bounds
  if (offset >= file.size) {
    Napi::Error::New(env, "Offset out of bounds").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Adjust length if needed
  if (offset + length > file.size) {
    length = file.size - offset;
  }

  // Create buffer with data
  char* data = static_cast<char*>(file.data) + offset;
  Napi::Buffer<char> buffer = Napi::Buffer<char>::Copy(env, data, length);

  // Return buffer
  return buffer;
}

// Check if file exists
Napi::Value FileOperations::FileExists(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file path
  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Check if file exists
  struct stat statBuf;
  bool exists = (stat(path.c_str(), &statBuf) == 0);

  // Return result
  return Napi::Boolean::New(env, exists);
}

// Get file size
Napi::Value FileOperations::GetFileSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get file path
  std::string path = info[0].As<Napi::String>().Utf8Value();

  // Get file size
  struct stat statBuf;
  if (stat(path.c_str(), &statBuf) != 0) {
    std::string error = "Error accessing file: " + std::string(strerror(errno));
    Napi::Error::New(env, error).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Return size
  return Napi::Number::New(env, statBuf.st_size);
}

// Get metrics
Napi::Value FileOperations::GetMetrics(const Napi::CallbackInfo& info) {
  updateMetrics();
  return metricsObject_.Value();
}

// Reset metrics
Napi::Value FileOperations::ResetMetrics(const Napi::CallbackInfo& info) {
  readTime_ = 0;
  readCount_ = 0;
  writeTime_ = 0;
  writeCount_ = 0;
  mmapTime_ = 0;
  mmapCount_ = 0;

  updateMetrics();
  return info.Env().Undefined();
}

// Update metrics object
void FileOperations::updateMetrics() {
  Napi::Env env = metricsObject_.Env();
  Napi::Object metrics = metricsObject_.Value().As<Napi::Object>();

  metrics.Set("readTime", Napi::Number::New(env, readTime_));
  metrics.Set("readCount", Napi::Number::New(env, readCount_));
  metrics.Set("writeTime", Napi::Number::New(env, writeTime_));
  metrics.Set("writeCount", Napi::Number::New(env, writeCount_));
  metrics.Set("mmapTime", Napi::Number::New(env, mmapTime_));
  metrics.Set("mmapCount", Napi::Number::New(env, mmapCount_));

  // Calculate average times
  metrics.Set("readAvgTime", Napi::Number::New(env, readCount_ > 0 ? readTime_ / readCount_ : 0));
  metrics.Set("writeAvgTime", Napi::Number::New(env, writeCount_ > 0 ? writeTime_ / writeCount_ : 0));
  metrics.Set("mmapAvgTime", Napi::Number::New(env, mmapCount_ > 0 ? mmapTime_ / mmapCount_ : 0));

  // Add mapped files info
  metrics.Set("mappedFilesCount", Napi::Number::New(env, mappedFiles_.size()));

  size_t activeMappedFiles = 0;
  size_t totalMappedBytes = 0;

  for (const auto& file : mappedFiles_) {
    if (file.data != nullptr) {
      activeMappedFiles++;
      totalMappedBytes += file.size;
    }
  }

  metrics.Set("activeMappedFiles", Napi::Number::New(env, activeMappedFiles));
  metrics.Set("totalMappedBytes", Napi::Number::New(env, totalMappedBytes));
}
