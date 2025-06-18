#ifndef NEXUREJS_THREAD_POOL_H
#define NEXUREJS_THREAD_POOL_H

#include <napi.h>
#include <thread>
#include <vector>
#include <queue>
#include <functional>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <unordered_map>
#include <future>
#include <map>
#include <optional>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <unordered_set>

namespace nexurejs {

// Enum for log levels
enum class LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
    NONE = 5
};

// Task priority levels
enum class TaskPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    CRITICAL = 3
};

/**
 * ThreadPool - High-performance thread pool for CPU-bound tasks
 *
 * Features:
 * - Dynamic thread count adjustment
 * - Task prioritization
 * - Task cancellation
 * - Comprehensive metrics
 */
class ThreadPool : public Napi::ObjectWrap<ThreadPool> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    ThreadPool(const Napi::CallbackInfo& info);
    ~ThreadPool();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
    // Task structure with priority
    struct Task {
        uint64_t id;
        std::function<Napi::Value()> function;
        TaskPriority priority;

        // Constructor with default priority
        Task(uint64_t taskId = 0,
             std::function<Napi::Value()> taskFunction = nullptr,
             TaskPriority taskPriority = TaskPriority::NORMAL)
            : id(taskId), function(taskFunction), priority(taskPriority) {}

        // Comparison for priority queue (higher priority tasks come first)
        bool operator<(const Task& other) const {
            return priority < other.priority;
        }
    };

    // Task status enumeration
    enum class TaskStatus {
        QUEUED,
        RUNNING,
        COMPLETED,
        FAILED,
        CANCELLED
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> submittedTasks{0};
        std::atomic<uint64_t> completedTasks{0};
        std::atomic<uint64_t> failedTasks{0};
        std::atomic<uint64_t> cancelledTasks{0};
        std::atomic<uint64_t> totalQueuedTasks{0};
        std::atomic<uint64_t> totalExecutionTimeUs{0};
    };

    // Helper struct to store promise deferreds with env
    class PromiseDeferred {
    private:
        std::optional<Napi::Env> env_;
        std::optional<Napi::Promise::Deferred> deferred_;
        bool initialized_ = false;

    public:
        // Default constructor - required for std::map
        PromiseDeferred() : initialized_(false) {}

        // Regular constructor
        PromiseDeferred(Napi::Env e) : initialized_(true) {
            env_ = e;
            deferred_ = Napi::Promise::Deferred::New(e);
        }

        void Resolve(const Napi::Value& value) const {
            if (initialized_ && deferred_.has_value()) {
                deferred_->Resolve(value);
            }
        }

        void Reject(const Napi::Value& value) const {
            if (initialized_ && deferred_.has_value()) {
                deferred_->Reject(value);
            }
        }

        Napi::Promise GetPromise() const {
            if (initialized_ && deferred_.has_value()) {
                return deferred_->Promise();
            }
            throw std::runtime_error("Attempting to get promise from uninitialized PromiseDeferred");
        }

        Napi::Env GetEnv() const {
            if (initialized_ && env_.has_value()) {
                return env_.value();
            }
            throw std::runtime_error("Attempting to get env from uninitialized PromiseDeferred");
        }

        bool IsInitialized() const {
            return initialized_;
        }
    };

    // Public JS methods
    Napi::Value Submit(const Napi::CallbackInfo& info);
    Napi::Value SubmitWithPriority(const Napi::CallbackInfo& info);
    Napi::Value WaitAll(const Napi::CallbackInfo& info);
    Napi::Value Cancel(const Napi::CallbackInfo& info);
    Napi::Value SetThreadCount(const Napi::CallbackInfo& info);
    Napi::Value GetThreadCount(const Napi::CallbackInfo& info);
    Napi::Value GetQueueSize(const Napi::CallbackInfo& info);
    Napi::Value GetActiveCount(const Napi::CallbackInfo& info);
    Napi::Value GetCompletedCount(const Napi::CallbackInfo& info);
    Napi::Value GetQueueStats(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
    Napi::Value SetLogLevel(const Napi::CallbackInfo& info);
    Napi::Value SetLogFile(const Napi::CallbackInfo& info);

    // Internal methods
    void workerFunction();
    bool isRetryableError(const std::string& errorMsg);
    void cleanupTaskResources(uint64_t taskId);

    // Logging methods
    void log(LogLevel level, const std::string& message);
    void logTrace(const std::string& message);
    void logDebug(const std::string& message);
    void logInfo(const std::string& message);
    void logWarn(const std::string& message);
    void logError(const std::string& message);
    std::string getCurrentTimestamp();
    std::string logLevelToString(LogLevel level);

    // Member variables
    std::vector<std::thread> workers_;
    std::priority_queue<Task> tasks_;
    std::mutex queueMutex_;
    std::condition_variable condition_;
    uint32_t threadCount_;
    std::atomic<bool> running_;
    std::atomic<uint32_t> activeCount_{0};
    std::atomic<uint64_t> lastTaskId_{0};
    std::atomic<bool> shutdown_{false};
    std::atomic<uint32_t> currentThreadId_{0};
    std::unordered_set<uint64_t> activeTaskIds_;

    // Task tracking
    std::unordered_map<uint64_t, TaskStatus> taskStatus_;
    std::unordered_map<uint64_t, Napi::Value> results_;
    std::unordered_map<uint64_t, std::string> taskErrors_;
    std::unordered_map<uint64_t, uint64_t> taskDurations_;
    std::map<uint64_t, PromiseDeferred> promises_;
    std::unordered_map<uint64_t, Napi::ThreadSafeFunction> threadSafeFunctions_;
    std::mutex resultsMutex_;

    // Metrics
    Metrics metrics_;

    // Logging
    LogLevel logLevel_ = LogLevel::INFO;
    std::string logFilePath_;
    std::mutex logMutex_;
    std::ofstream logFile_;
    bool consoleLogging_ = true;
};

} // namespace nexurejs

#endif // NEXUREJS_THREAD_POOL_H
