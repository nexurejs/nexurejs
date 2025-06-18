#ifndef NEXUREJS_FILE_OPERATIONS_H
#define NEXUREJS_FILE_OPERATIONS_H

#include <napi.h>
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <atomic>
#include <mutex>
#include <chrono>

namespace nexurejs {

/**
 * FileOperations - High-performance file I/O operations
 *
 * Features:
 * - Asynchronous and synchronous file operations
 * - Memory-mapped file access for large files
 * - Streaming file reads/writes
 * - File locking and concurrency control
 * - Performance metrics tracking
 */
class FileOperations : public Napi::ObjectWrap<FileOperations> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    FileOperations(const Napi::CallbackInfo& info);
    ~FileOperations();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
    // File handle structure
    struct FileHandle {
        std::string path;
        void* handle;          // Implementation-specific handle
        bool isOpen;
        bool isReadOnly;
        bool isMemoryMapped;
        void* mappedData;
        size_t mappedSize;
        size_t position;
    };

    // File lock structure
    struct FileLock {
        std::string path;
        void* handle;          // Implementation-specific lock handle
        bool isExclusive;
        std::chrono::time_point<std::chrono::steady_clock> acquiredAt;
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> totalFilesOpened{0};
        std::atomic<uint64_t> totalFilesClosed{0};
        std::atomic<uint64_t> totalBytesRead{0};
        std::atomic<uint64_t> totalBytesWritten{0};
        std::atomic<uint64_t> totalMemoryMapped{0};
        std::atomic<uint64_t> totalLocksAcquired{0};
        std::atomic<uint64_t> totalLocksReleased{0};
        std::atomic<uint64_t> totalReadTimeMs{0};
        std::atomic<uint64_t> totalWriteTimeMs{0};
        std::atomic<uint64_t> maxFileSize{0};
    };

    // Public JS methods
    Napi::Value OpenFile(const Napi::CallbackInfo& info);
    Napi::Value CloseFile(const Napi::CallbackInfo& info);
    Napi::Value ReadFile(const Napi::CallbackInfo& info);
    Napi::Value WriteFile(const Napi::CallbackInfo& info);
    Napi::Value MemoryMapFile(const Napi::CallbackInfo& info);
    Napi::Value UnmapFile(const Napi::CallbackInfo& info);
    Napi::Value SeekFile(const Napi::CallbackInfo& info);
    Napi::Value LockFile(const Napi::CallbackInfo& info);
    Napi::Value UnlockFile(const Napi::CallbackInfo& info);
    Napi::Value GetFileInfo(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Internal methods
    int getFileHandle(const std::string& path);
    void closeFileHandle(int index);
    bool lockFileInternal(const std::string& path, bool exclusive);
    bool unlockFileInternal(const std::string& path);

    // Member variables
    std::vector<std::shared_ptr<FileHandle>> fileHandles_;
    std::map<std::string, std::shared_ptr<FileLock>> fileLocks_;
    std::mutex handlesMutex_;
    std::mutex locksMutex_;
    Metrics metrics_;
};

} // namespace nexurejs

#endif // NEXUREJS_FILE_OPERATIONS_H
