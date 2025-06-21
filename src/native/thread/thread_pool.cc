#include <napi.h>
#include <string>
#include <unordered_map>
#include <atomic>
#include <chrono>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <vector>
#include <memory>
#include <functional>
#include <future>
#include <algorithm>
#include <random>
#include <sstream>
#include <iomanip>
#include "thread_pool.h"

namespace nexurejs {

/**
 * ThreadPool - A high-performance thread pool implementation for CPU-intensive tasks
 *
 * Features:
 * - Dynamic thread sizing (min/max threads)
 * - Task prioritization
 * - Detailed performance metrics
 * - Task cancellation
 * - Waiting for task completion
 */

// Initialize the static constructor
Napi::FunctionReference ThreadPool::constructor;

// Implementation of the ThreadPool class methods
Napi::Object ThreadPool::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "ThreadPool", {
    InstanceMethod("submit", &ThreadPool::Submit),
    InstanceMethod("submitWithPriority", &ThreadPool::SubmitWithPriority),
    InstanceMethod("cancel", &ThreadPool::Cancel),
    InstanceMethod("waitAll", &ThreadPool::WaitAll),
    InstanceMethod("getQueueStats", &ThreadPool::GetQueueStats),
    InstanceMethod("setLogLevel", &ThreadPool::SetLogLevel),
    InstanceMethod("setLogFile", &ThreadPool::SetLogFile)
  });

  // Store constructor for static access
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  // Add the class to exports
  exports.Set("ThreadPool", func);

  return exports;
}

// Singleton instance accessor
Napi::Value ThreadPool::GetInstance(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  static Napi::ObjectReference instance;
  if (instance.IsEmpty()) {
    // Create default ThreadPool instance if not already created
    Napi::Object obj = constructor.New({});
    instance = Napi::Persistent(obj);
  }

  return instance.Value();
}

ThreadPool::ThreadPool(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ThreadPool>(info) {
  Napi::Env env = info.Env();

  // Default constructor
  uint32_t threadCount = std::thread::hardware_concurrency();

  // Check if thread count was specified
  if (info.Length() > 0 && info[0].IsNumber()) {
    threadCount = info[0].As<Napi::Number>().Uint32Value();
    // Ensure at least 1 thread and not more than hardware concurrency
    threadCount = std::max(1u, std::min(threadCount, std::thread::hardware_concurrency()));
  }

  // Initialize logging
  logLevel_ = LogLevel::INFO;  // Default log level
  consoleLogging_ = true;      // Default to console logging enabled

  // Initialize metrics
  metrics_.submittedTasks = 0;
  metrics_.completedTasks = 0;
  metrics_.failedTasks = 0;
  metrics_.cancelledTasks = 0;
  metrics_.totalQueuedTasks = 0;
  metrics_.totalExecutionTimeUs = 0;

  // Initialize thread control variables
  shutdown_ = false;
  currentThreadId_ = 0;
  lastTaskId_ = 0;

  logInfo("Initializing ThreadPool with " + std::to_string(threadCount) + " worker threads");

  // Create worker threads
  for (uint32_t i = 0; i < threadCount; ++i) {
    workers_.emplace_back([this] { workerFunction(); });
    logDebug("Created worker thread #" + std::to_string(i+1));
  }

  // Initialize JavaScript function constructors
  Napi::HandleScope scope(env);

  // Define the class properties and methods
  logInfo("ThreadPool initialization complete with " + std::to_string(threadCount) + " worker threads");
}

ThreadPool::~ThreadPool() {
  logInfo("Shutting down ThreadPool...");

  // Set shutdown flag
  shutdown_ = true;

  // Wake up all worker threads
  condition_.notify_all();

  // Wait for all threads to complete
  for (auto& worker : workers_) {
    if (worker.joinable()) {
      worker.join();
    }
  }

  // Clear the tasks queue
  std::priority_queue<Task> emptyQueue;
  {
    std::unique_lock<std::mutex> lock(queueMutex_);
    tasks_.swap(emptyQueue);
  }

  // Log final metrics
  logInfo("ThreadPool final metrics: submitted=" + std::to_string(metrics_.submittedTasks) +
          ", completed=" + std::to_string(metrics_.completedTasks) +
          ", failed=" + std::to_string(metrics_.failedTasks) +
          ", cancelled=" + std::to_string(metrics_.cancelledTasks));

  // Close log file if open
  if (logFile_.is_open()) {
    logFile_.close();
    logInfo("Log file closed");
  }

  logInfo("ThreadPool shutdown complete");
}

// Static method to reset metrics globally
Napi::Value ThreadPool::ResetMetricsStatic(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object instance = GetInstance(info).As<Napi::Object>();

  Napi::ObjectWrap<ThreadPool>::Unwrap(instance)->ResetMetrics(info);
  return env.Undefined();
}

void ThreadPool::workerFunction() {
  const uint32_t threadId = ++currentThreadId_;
  logDebug("Worker thread " + std::to_string(threadId) + " started");

  // Keep running tasks until shutdown is requested
  while (!shutdown_) {
    Task task;
    bool taskFound = false;

    // Wait for a task to be available
    {
      std::unique_lock<std::mutex> lock(queueMutex_);

      // Wait for a task or shutdown
      condition_.wait(lock, [this] {
        return !tasks_.empty() || shutdown_;
      });

      // If shutdown is requested, exit
      if (shutdown_) {
        logDebug("Worker thread " + std::to_string(threadId) + " shutting down (shutdown flag set)");
        break;
      }

      // Get the next task
      if (!tasks_.empty()) {
        task = std::move(tasks_.top());
        tasks_.pop();
        taskFound = true;

        // Update metrics
        metrics_.totalQueuedTasks--;

        logDebug("Worker thread " + std::to_string(threadId) + " dequeued task #" + std::to_string(task.id));
      }
    }

    // Execute the task
    if (taskFound) {
      uint64_t taskId = task.id;
      bool taskCompleted = false;
      const int maxRetries = 3; // Maximum number of retries for a task
      int retryCount = 0;

      while (!taskCompleted && retryCount <= maxRetries) {
        if (retryCount > 0) {
          logWarn("Retrying task #" + std::to_string(taskId) + " (attempt " + std::to_string(retryCount + 1) + " of " + std::to_string(maxRetries + 1) + ")");
          // Add a small delay before retrying to avoid rapid retry loops
          std::this_thread::sleep_for(std::chrono::milliseconds(50 * retryCount));
        }

        try {
          // Execute the task
          logInfo("Worker thread " + std::to_string(threadId) + " executing task #" + std::to_string(taskId));
          Napi::Value result = task.function();

          // Check if task was cancelled while executing
          {
            std::unique_lock<std::mutex> lock(resultsMutex_);
            if (taskStatus_[taskId] == TaskStatus::CANCELLED) {
              logWarn("Task #" + std::to_string(taskId) + " was cancelled during execution");
              // Task was cancelled, clean up
              cleanupTaskResources(taskId);

              // Update metrics
              metrics_.cancelledTasks++;
              taskCompleted = true;
              break;
            }
          }

          // Task completed successfully
          PromiseDeferred deferred;

          {
            std::unique_lock<std::mutex> lock(resultsMutex_);
            // Check if we still have a promise for this task
            if (promises_.find(taskId) != promises_.end()) {
              deferred = promises_[taskId];
              // Update task status
              taskStatus_[taskId] = TaskStatus::COMPLETED;
              logInfo("Task #" + std::to_string(taskId) + " completed successfully");
            } else {
              // Promise was removed (possibly due to cancellation)
              logWarn("Task #" + std::to_string(taskId) + " completed but no promise found");
              taskCompleted = true;
              break;
            }
          }

          // Resolve the promise with the result
          deferred.Resolve(result);

          // Clean up resources
          cleanupTaskResources(taskId);

          // Update metrics
          metrics_.completedTasks++;
          taskCompleted = true;

        } catch (const std::exception& e) {
          std::string errorMsg = e.what();
          logError("Task #" + std::to_string(taskId) + " failed with exception: " + errorMsg);

          // Check if error is retryable
          if (retryCount < maxRetries && isRetryableError(errorMsg)) {
            retryCount++;
            logWarn("Task #" + std::to_string(taskId) + " will be retried due to retryable error");
            continue;
          }

          // Non-retryable error or max retries reached
          PromiseDeferred deferred;

          {
            std::unique_lock<std::mutex> lock(resultsMutex_);
            // Check if we still have a promise for this task
            if (promises_.find(taskId) != promises_.end()) {
              deferred = promises_[taskId];
              // Update task status
              taskStatus_[taskId] = TaskStatus::FAILED;
              logError("Task #" + std::to_string(taskId) + " failed after " +
                       std::to_string(retryCount) + " retry attempts");
            } else {
              // Promise was removed (possibly due to cancellation)
              logWarn("Task #" + std::to_string(taskId) + " failed but no promise found");
              taskCompleted = true;
              break;
            }
          }

          // Reject the promise with the error
          std::string errMsg = errorMsg; // Make a copy for safety
          try {
              Napi::Env env = deferred.GetEnv();
              Napi::Error error = Napi::Error::New(env, errMsg);
              deferred.Reject(error.Value());
          } catch (const std::exception& e) {
              logError("Error creating rejection: " + std::string(e.what()));
          }

          // Clean up resources
          cleanupTaskResources(taskId);

          // Update metrics
          metrics_.failedTasks++;
          taskCompleted = true;

        } catch (...) {
          // Unknown exception
          logError("Task #" + std::to_string(taskId) + " failed with unknown exception");

          if (retryCount < maxRetries) {
            retryCount++;
            logWarn("Task #" + std::to_string(taskId) + " will be retried after unknown error");
            continue;
          }

          // Max retries reached for unknown error
          PromiseDeferred deferred;

          {
            std::unique_lock<std::mutex> lock(resultsMutex_);
            // Check if we still have a promise for this task
            if (promises_.find(taskId) != promises_.end()) {
              deferred = promises_[taskId];
              // Update task status
              taskStatus_[taskId] = TaskStatus::FAILED;
              logError("Task #" + std::to_string(taskId) + " failed with unknown error after " +
                       std::to_string(retryCount) + " retry attempts");
            } else {
              // Promise was removed
              logWarn("Task #" + std::to_string(taskId) + " failed with unknown error but no promise found");
              taskCompleted = true;
              break;
            }
          }

          // Reject the promise with a generic error
          try {
              Napi::Env env = deferred.GetEnv();
              Napi::Error error = Napi::Error::New(env, "Unknown error occurred during task execution");
              deferred.Reject(error.Value());
          } catch (const std::exception& e) {
              logError("Error creating rejection for unknown error: " + std::string(e.what()));
          }

          // Clean up resources
          cleanupTaskResources(taskId);

          // Update metrics
          metrics_.failedTasks++;
          taskCompleted = true;
        }
      }
    }
  }

  logInfo("Worker thread " + std::to_string(threadId) + " exiting");
}

// Helper method to determine if an error is retryable
bool ThreadPool::isRetryableError(const std::string& errorMsg) {
  // Check for known retryable error patterns

  // Network errors
  if (errorMsg.find("ECONNRESET") != std::string::npos ||
      errorMsg.find("ETIMEDOUT") != std::string::npos ||
      errorMsg.find("ECONNREFUSED") != std::string::npos ||
      errorMsg.find("ENETUNREACH") != std::string::npos ||
      errorMsg.find("network") != std::string::npos ||
      errorMsg.find("connection") != std::string::npos) {
    logDebug("Detected retryable network error: " + errorMsg);
    return true;
  }

  // Resource unavailable errors
  if (errorMsg.find("EAGAIN") != std::string::npos ||
      errorMsg.find("EBUSY") != std::string::npos ||
      errorMsg.find("resource") != std::string::npos ||
      errorMsg.find("unavailable") != std::string::npos ||
      errorMsg.find("timeout") != std::string::npos) {
    logDebug("Detected retryable resource error: " + errorMsg);
    return true;
  }

  // Concurrency/race condition errors
  if (errorMsg.find("EDEADLK") != std::string::npos ||
      errorMsg.find("concurrent") != std::string::npos ||
      errorMsg.find("race") != std::string::npos ||
      errorMsg.find("conflict") != std::string::npos ||
      errorMsg.find("deadlock") != std::string::npos) {
    logDebug("Detected retryable concurrency error: " + errorMsg);
    return true;
  }

  // Database specific errors
  if (errorMsg.find("deadlock") != std::string::npos ||
      errorMsg.find("lock timeout") != std::string::npos ||
      errorMsg.find("serialization") != std::string::npos) {
    logDebug("Detected retryable database error: " + errorMsg);
    return true;
  }

  // Memory/resource errors that might be temporary
  if (errorMsg.find("memory") != std::string::npos ||
      errorMsg.find("ENOMEM") != std::string::npos) {
    logDebug("Detected potentially retryable memory error: " + errorMsg);
    return true;
  }

  // Errors we know are NOT retryable
  if (errorMsg.find("permission") != std::string::npos ||
      errorMsg.find("EPERM") != std::string::npos ||
      errorMsg.find("EACCES") != std::string::npos ||
      errorMsg.find("syntax") != std::string::npos ||
      errorMsg.find("invalid") != std::string::npos ||
      errorMsg.find("not found") != std::string::npos ||
      errorMsg.find("ENOENT") != std::string::npos ||
      errorMsg.find("argument") != std::string::npos) {
    logDebug("Detected non-retryable error: " + errorMsg);
    return false;
  }

  // By default, assume unknown errors might be retryable
  // This is a policy decision - in some cases you might want to be conservative
  logDebug("Unknown error type, assuming retryable: " + errorMsg);
  return true;
}

// Helper method to clean up task resources
void ThreadPool::cleanupTaskResources(uint64_t taskId) {
  std::unique_lock<std::mutex> lock(resultsMutex_);
  logTrace("Cleaning up resources for task #" + std::to_string(taskId));

  // Remove the promise
  promises_.erase(taskId);

  // Remove the thread-safe function
  threadSafeFunctions_.erase(taskId);

  // Remove other task-related data
  taskStatus_.erase(taskId);

  // Remove from active tasks list if it's there
  if (activeTaskIds_.find(taskId) != activeTaskIds_.end()) {
    activeTaskIds_.erase(taskId);
  }

  logTrace("Resources for task #" + std::to_string(taskId) + " cleaned up");
}

Napi::Value ThreadPool::Submit(const Napi::CallbackInfo& info) {
  // Delegate to SubmitWithPriority with NORMAL priority
  return SubmitWithPriority(info);
}

Napi::Value ThreadPool::WaitAll(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Get optional timeout parameter
  uint32_t timeoutMs = 0; // 0 means no timeout
  if (info.Length() > 0 && info[0].IsNumber()) {
    timeoutMs = info[0].As<Napi::Number>().Uint32Value();
  }

  logInfo("WaitAll called" + (timeoutMs > 0 ? " with timeout " + std::to_string(timeoutMs) + "ms" : " without timeout"));

  // Create a promise to return
  PromiseDeferred deferred(env);
  Napi::Promise promise = deferred.GetPromise();

  // Create a thread that will wait for all tasks to complete
  std::thread waitThread([this, deferred, timeoutMs]() {
    // Keep checking until all tasks are done or timeout occurs
    bool allDone = false;
    bool timedOut = false;
    auto startTime = std::chrono::steady_clock::now();

    logDebug("Wait thread started");

    while (!allDone && !timedOut) {
      // Check if queue is empty and no tasks are running
      std::unique_lock<std::mutex> queueLock(queueMutex_);
      bool queueEmpty = tasks_.empty();
      queueLock.unlock();

      std::unique_lock<std::mutex> resultsLock(resultsMutex_);
      bool noRunningTasks = true;
      for (const auto& pair : taskStatus_) {
        if (pair.second == TaskStatus::QUEUED || pair.second == TaskStatus::RUNNING) {
          noRunningTasks = false;
          break;
        }
      }
      resultsLock.unlock();

      allDone = queueEmpty && noRunningTasks;

      // Check timeout if applicable
      if (timeoutMs > 0 && !allDone) {
        auto currentTime = std::chrono::steady_clock::now();
        auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
          currentTime - startTime).count();

        if (elapsedMs >= timeoutMs) {
          timedOut = true;
          logWarn("WaitAll timed out after " + std::to_string(elapsedMs) + "ms");
        }
      }

      // Sleep briefly before checking again
      if (!allDone && !timedOut) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
      }
    }

    // Get metrics
    Napi::Env env = deferred.GetEnv();
    Napi::Object result = Napi::Object::New(env);
    Napi::Object metrics = Napi::Object::New(env);

    metrics.Set("submitted", Napi::Number::New(env, metrics_.submittedTasks));
    metrics.Set("completed", Napi::Number::New(env, metrics_.completedTasks));
    metrics.Set("failed", Napi::Number::New(env, metrics_.failedTasks));
    metrics.Set("cancelled", Napi::Number::New(env, metrics_.cancelledTasks));

    result.Set("allCompleted", Napi::Boolean::New(env, allDone));
    result.Set("timedOut", Napi::Boolean::New(env, timedOut));
    result.Set("metrics", metrics);

    // Calculate elapsed time
    auto endTime = std::chrono::steady_clock::now();
    auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
      endTime - startTime).count();
    result.Set("elapsedMs", Napi::Number::New(env, elapsedMs));

    // Create arrays of completed and failed task IDs
    Napi::Array completedTasks = Napi::Array::New(env);
    Napi::Array failedTasks = Napi::Array::New(env);
    Napi::Array cancelledTasks = Napi::Array::New(env);

    uint32_t completedIdx = 0;
    uint32_t failedIdx = 0;
    uint32_t cancelledIdx = 0;

    std::unique_lock<std::mutex> lock(resultsMutex_);
    for (const auto& pair : taskStatus_) {
      if (pair.second == TaskStatus::COMPLETED) {
        completedTasks[completedIdx++] = Napi::Number::New(env, pair.first);
      } else if (pair.second == TaskStatus::FAILED) {
        failedTasks[failedIdx++] = Napi::Number::New(env, pair.first);
      } else if (pair.second == TaskStatus::CANCELLED) {
        cancelledTasks[cancelledIdx++] = Napi::Number::New(env, pair.first);
      }
    }

    result.Set("completedTasks", completedTasks);
    result.Set("failedTasks", failedTasks);
    result.Set("cancelledTasks", cancelledTasks);

    // Set flag to indicate if there are still pending tasks
    result.Set("pendingTasks", Napi::Boolean::New(env, !allDone));

    // Resolve the promise with the result
    deferred.Resolve(result);

    std::string resultMsg = allDone ? "completed successfully" : "timed out";
    logInfo("WaitAll " + resultMsg + " after " + std::to_string(elapsedMs) + "ms");
  });

  // Detach the thread since its result will be delivered via the promise
  waitThread.detach();

  return promise;
}

Napi::Value ThreadPool::Cancel(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Check arguments
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Task ID expected as first argument").ThrowAsJavaScriptException();
    logError("Cancel called with invalid arguments");
    return Napi::Boolean::New(env, false);
  }

  // Get the task ID - use Uint32Value and convert to uint64_t
  uint64_t taskId = static_cast<uint64_t>(info[0].As<Napi::Number>().Uint32Value());

  logInfo("Attempting to cancel task #" + std::to_string(taskId));

  bool cancelled = false;
  bool wasInQueue = false;

  // Check if the task is in the queue
  {
    std::unique_lock<std::mutex> lock(queueMutex_);

    // Create a temporary queue to store tasks while we search
    std::priority_queue<Task> tempQueue;
    bool foundTask = false;

    // Search for the task in the queue
    while (!tasks_.empty()) {
      Task task = tasks_.top();
      tasks_.pop();

      if (task.id == taskId) {
        foundTask = true;
        wasInQueue = true;
        // Don't add this task back to the queue
        logInfo("Task #" + std::to_string(taskId) + " found in queue and removed");
      } else {
        // Add the task back to the temporary queue
        tempQueue.push(std::move(task));
      }
    }

    // Put all tasks back in the original queue
    tasks_ = std::move(tempQueue);

    if (foundTask) {
      metrics_.totalQueuedTasks--;
      cancelled = true;
    }
  }

  // If the task wasn't in the queue, check if it's running and mark as cancelled
  if (!wasInQueue) {
    std::unique_lock<std::mutex> lock(resultsMutex_);

    // Check if the task exists and is still active
    if (taskStatus_.find(taskId) != taskStatus_.end()) {
      TaskStatus status = taskStatus_[taskId];

      if (status == TaskStatus::QUEUED || status == TaskStatus::RUNNING) {
        // Mark as cancelled
        taskStatus_[taskId] = TaskStatus::CANCELLED;
        logInfo("Task #" + std::to_string(taskId) + " marked as cancelled (status was " +
                (status == TaskStatus::QUEUED ? "QUEUED" : "RUNNING") + ")");
        cancelled = true;
      } else {
        // Task already completed or failed
        logWarn("Task #" + std::to_string(taskId) + " cannot be cancelled (status: " +
               (status == TaskStatus::COMPLETED ? "COMPLETED" :
                (status == TaskStatus::FAILED ? "FAILED" : "CANCELLED")) + ")");
      }
    } else {
      // Task not found in status map
      logWarn("Task #" + std::to_string(taskId) + " not found in task registry");
    }
  }

  // If the task was cancelled, perform cleanup
  if (cancelled) {
    std::unique_lock<std::mutex> lock(resultsMutex_);

    // If the task is still in the promises map, reject it
    if (promises_.find(taskId) != promises_.end() && promises_[taskId].IsInitialized()) {
      PromiseDeferred& deferred = promises_[taskId];

      // Reject the promise with a cancellation error
      Napi::Error error = Napi::Error::New(deferred.GetEnv(), "Task was cancelled");
      Napi::Object errorObj = error.Value().As<Napi::Object>();
      errorObj.Set("taskId", Napi::Number::New(deferred.GetEnv(), taskId));
      errorObj.Set("cancelled", Napi::Boolean::New(deferred.GetEnv(), true));

      deferred.Reject(error.Value());

      // Clean up resources if the task was in the queue
      if (wasInQueue) {
        cleanupTaskResources(taskId);
      }

      // Update metrics
      metrics_.cancelledTasks++;
    }
  }

  return Napi::Boolean::New(env, cancelled);
}

Napi::Value ThreadPool::SetThreadCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Check arguments
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Thread count expected as first argument").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the new thread count
  uint32_t newThreadCount = info[0].As<Napi::Number>().Uint32Value();

  // Validate thread count
  if (newThreadCount < 1) {
    Napi::RangeError::New(env, "Thread count must be at least 1").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Restart the thread pool with the new thread count
  {
    // Signal all threads to stop
    {
      std::unique_lock<std::mutex> lock(queueMutex_);
      running_ = false;
      condition_.notify_all();
    }

    // Wait for all threads to finish
    for (auto& worker : workers_) {
      if (worker.joinable()) {
        worker.join();
      }
    }

    // Update thread count
    threadCount_ = newThreadCount;
    workers_.clear();

    // Start new worker threads
    {
      std::unique_lock<std::mutex> lock(queueMutex_);
      running_ = true;
    }

    for (uint32_t i = 0; i < threadCount_; i++) {
      workers_.emplace_back(&ThreadPool::workerFunction, this);
    }
  }

  return Napi::Number::New(env, threadCount_);
}

Napi::Value ThreadPool::GetThreadCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, threadCount_);
}

Napi::Value ThreadPool::GetQueueSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::unique_lock<std::mutex> lock(queueMutex_);
  return Napi::Number::New(env, tasks_.size());
}

Napi::Value ThreadPool::GetActiveCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::unique_lock<std::mutex> lock(queueMutex_);
  return Napi::Number::New(env, activeCount_);
}

Napi::Value ThreadPool::GetCompletedCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, metrics_.completedTasks);
}

Napi::Value ThreadPool::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::Object result = Napi::Object::New(env);

  result.Set("submittedTasks", Napi::Number::New(env, metrics_.submittedTasks));
  result.Set("completedTasks", Napi::Number::New(env, metrics_.completedTasks));
  result.Set("failedTasks", Napi::Number::New(env, metrics_.failedTasks));
  result.Set("cancelledTasks", Napi::Number::New(env, metrics_.cancelledTasks));
  result.Set("totalQueuedTasks", Napi::Number::New(env, metrics_.totalQueuedTasks));
  result.Set("totalExecutionTimeUs", Napi::Number::New(env, metrics_.totalExecutionTimeUs));

  // Calculate average execution time
  double avgExecutionTime = metrics_.completedTasks > 0
    ? metrics_.totalExecutionTimeUs / (double)metrics_.completedTasks
    : 0;

  result.Set("avgExecutionTimeUs", Napi::Number::New(env, avgExecutionTime));

  // Current state
  std::unique_lock<std::mutex> lock(queueMutex_);
  result.Set("queueSize", Napi::Number::New(env, tasks_.size()));
  result.Set("activeCount", Napi::Number::New(env, activeCount_));
  result.Set("threadCount", Napi::Number::New(env, threadCount_));

  return result;
}

Napi::Value ThreadPool::ResetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Reset all metrics to zero
  metrics_.submittedTasks = 0;
  metrics_.completedTasks = 0;
  metrics_.failedTasks = 0;
  metrics_.cancelledTasks = 0;
  metrics_.totalQueuedTasks = 0;
  metrics_.totalExecutionTimeUs = 0;

  return env.Undefined();
}

// Logging implementation
std::string ThreadPool::getCurrentTimestamp() {
  // Get current time point
  auto now = std::chrono::system_clock::now();
  auto nowMs = std::chrono::time_point_cast<std::chrono::milliseconds>(now);
  auto epoch = nowMs.time_since_epoch();
  auto value = std::chrono::duration_cast<std::chrono::milliseconds>(epoch);

  // Extract milliseconds part
  long milliseconds = value.count() % 1000;

  // Convert to time_t for formatting
  auto nowTimeT = std::chrono::system_clock::to_time_t(now);

  // Format the time
  std::stringstream ss;
  std::tm tm;

  #ifdef _WIN32
  localtime_s(&tm, &nowTimeT);
  #else
  localtime_r(&nowTimeT, &tm);
  #endif

  ss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
  ss << "." << std::setw(3) << std::setfill('0') << milliseconds;

  return ss.str();
}

std::string ThreadPool::logLevelToString(LogLevel level) {
  switch (level) {
    case LogLevel::TRACE:
      return "TRACE";
    case LogLevel::DEBUG:
      return "DEBUG";
    case LogLevel::INFO:
      return "INFO";
    case LogLevel::WARN:
      return "WARN";
    case LogLevel::ERROR:
      return "ERROR";
    case LogLevel::NONE:
      return "NONE";
    default:
      return "UNKNOWN";
  }
}

void ThreadPool::log(LogLevel level, const std::string& message) {
  if (level < logLevel_) {
    return;  // Skip logging for levels below current threshold
  }

  std::string timestamp = getCurrentTimestamp();
  std::string levelStr = logLevelToString(level);

  // Format the log entry
  std::stringstream logEntry;
  logEntry << timestamp << " [ThreadPool] [" << levelStr << "] "
           << message << std::endl;

  // Lock for thread safety when accessing log file or console
  {
    std::unique_lock<std::mutex> lock(logMutex_);

    // Log to file if enabled
    if (!logFilePath_.empty() && logFile_.is_open()) {
      logFile_ << logEntry.str();
      logFile_.flush();
    }

    // Log to console if enabled
    if (consoleLogging_) {
      // Use different output streams based on level
      if (level >= LogLevel::ERROR) {
        fprintf(stderr, "%s", logEntry.str().c_str());
      } else {
        printf("%s", logEntry.str().c_str());
      }
    }
  }
}

void ThreadPool::logTrace(const std::string& message) {
  log(LogLevel::TRACE, message);
}

void ThreadPool::logDebug(const std::string& message) {
  log(LogLevel::DEBUG, message);
}

void ThreadPool::logInfo(const std::string& message) {
  log(LogLevel::INFO, message);
}

void ThreadPool::logWarn(const std::string& message) {
  log(LogLevel::WARN, message);
}

void ThreadPool::logError(const std::string& message) {
  log(LogLevel::ERROR, message);
}

// Set log level method
Napi::Value ThreadPool::SetLogLevel(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected log level as number").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int level = info[0].As<Napi::Number>().Int32Value();

  // Validate and set log level
  if (level < static_cast<int>(LogLevel::TRACE) || level > static_cast<int>(LogLevel::NONE)) {
    Napi::RangeError::New(env, "Invalid log level, must be between 0 and 5").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  logLevel_ = static_cast<LogLevel>(level);

  // Return the current log level
  return Napi::Number::New(env, static_cast<int>(logLevel_));
}

// Set log file method
Napi::Value ThreadPool::SetLogFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Close existing log file if open
  {
    std::unique_lock<std::mutex> lock(logMutex_);
    if (logFile_.is_open()) {
      logFile_.close();
    }
  }

  // If no arguments or undefined/null, disable file logging
  if (info.Length() < 1 || info[0].IsUndefined() || info[0].IsNull()) {
    logFilePath_ = "";
    return env.Undefined();
  }

  // Expect string argument for log path
  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Expected string for log file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get new log file path
  logFilePath_ = info[0].As<Napi::String>().Utf8Value();

  // Try to open log file
  {
    std::unique_lock<std::mutex> lock(logMutex_);
    logFile_.open(logFilePath_, std::ios::app);

    if (!logFile_.is_open()) {
      Napi::Error::New(env, "Failed to open log file: " + logFilePath_).ThrowAsJavaScriptException();
      logFilePath_ = "";
      return env.Undefined();
    }

    // Write initial log entry
    logFile_ << getCurrentTimestamp() << " [ThreadPool] [INFO ] Logging initialized" << std::endl;
  }

  // Check for console logging option
  if (info.Length() >= 2 && info[1].IsBoolean()) {
    consoleLogging_ = info[1].As<Napi::Boolean>().Value();
  }

  return Napi::String::New(env, logFilePath_);
}

Napi::Value ThreadPool::SubmitWithPriority(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Check arguments
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Function expected as first argument").ThrowAsJavaScriptException();
    logError("SubmitWithPriority called with invalid arguments");
    return env.Undefined();
  }

  // Get the function to execute
  Napi::Function jsFunction = info[0].As<Napi::Function>();

  // Get the priority (default to NORMAL if not specified)
  TaskPriority priority = TaskPriority::NORMAL;
  if (info.Length() > 1 && info[1].IsNumber()) {
    int priorityValue = info[1].As<Napi::Number>().Int32Value();

    // Validate and set the priority
    if (priorityValue >= 0 && priorityValue <= static_cast<int>(TaskPriority::CRITICAL)) {
      priority = static_cast<TaskPriority>(priorityValue);
    } else {
      logWarn("Invalid priority value: " + std::to_string(priorityValue) + ", using NORMAL priority");
    }
  }

  // Generate a unique task ID
  uint64_t taskId = ++lastTaskId_;

  std::string priorityStr;
  switch (priority) {
    case TaskPriority::LOW: priorityStr = "LOW"; break;
    case TaskPriority::NORMAL: priorityStr = "NORMAL"; break;
    case TaskPriority::HIGH: priorityStr = "HIGH"; break;
    case TaskPriority::CRITICAL: priorityStr = "CRITICAL"; break;
    default: priorityStr = "UNKNOWN";
  }

  logDebug("Creating task #" + std::to_string(taskId) + " with priority " + priorityStr);

  // Create the PromiseDeferred object with environment
  PromiseDeferred promiseDeferred(env);

  // Get the promise to return before we start working with thread-safe functions
  Napi::Promise promise = promiseDeferred.GetPromise();

  // Create ThreadSafeFunction for callbacks
  auto tsfn = Napi::ThreadSafeFunction::New(
    env,
    jsFunction,
    "ThreadPoolCallback",
    0,
    1,
    [](Napi::Env) {}
  );

  // Store the deferred promise and thread-safe function
  {
    std::unique_lock<std::mutex> lock(resultsMutex_);
    promises_.insert({taskId, std::move(promiseDeferred)});
    threadSafeFunctions_[taskId] = std::move(tsfn);
    taskStatus_[taskId] = TaskStatus::QUEUED;

    logTrace("Task #" + std::to_string(taskId) + " promise and function stored");
  }

  // Create a function to execute on the worker thread
  auto taskFunction = [this, taskId]() -> Napi::Value {
    logTrace("Starting execution of task #" + std::to_string(taskId));

    // Retrieve the thread-safe function
    Napi::ThreadSafeFunction tsfn;

    {
      std::unique_lock<std::mutex> lock(resultsMutex_);
      if (threadSafeFunctions_.find(taskId) != threadSafeFunctions_.end()) {
        tsfn = threadSafeFunctions_[taskId];
      }
    }

    // Update task status
    {
      std::unique_lock<std::mutex> lock(resultsMutex_);
      taskStatus_[taskId] = TaskStatus::RUNNING;
      logDebug("Task #" + std::to_string(taskId) + " status updated to RUNNING");
    }

    // Execute the JS function on the main thread
    Napi::Value result;
    std::promise<Napi::Value> resultPromise;
    auto resultFuture = resultPromise.get_future();

    // Call the JS function via ThreadSafeFunction
    auto callback = [&resultPromise, taskId, this](Napi::Env env, Napi::Function jsCallback) {
      try {
        // Create a handle scope for this callback
        Napi::HandleScope scope(env);

        logTrace("Executing JavaScript function for task #" + std::to_string(taskId));

        // Call the function with no arguments
        Napi::Value jsResult = jsCallback.Call({});

        // For debugging
        if (jsResult.IsNumber()) {
          logDebug("Task #" + std::to_string(taskId) + " returned number: " +
                   std::to_string(jsResult.As<Napi::Number>().Int32Value()));
        } else if (jsResult.IsString()) {
          logDebug("Task #" + std::to_string(taskId) + " returned string of length " +
                   std::to_string(jsResult.As<Napi::String>().Utf8Value().length()));
        } else if (jsResult.IsBoolean()) {
          logDebug("Task #" + std::to_string(taskId) + " returned boolean: " +
                   (jsResult.As<Napi::Boolean>().Value() ? "true" : "false"));
        } else if (jsResult.IsNull()) {
          logDebug("Task #" + std::to_string(taskId) + " returned null");
        } else if (jsResult.IsUndefined()) {
          logDebug("Task #" + std::to_string(taskId) + " returned undefined");
        } else {
          logDebug("Task #" + std::to_string(taskId) + " returned object or other type");
        }

        resultPromise.set_value(jsResult);
      } catch (const std::exception& e) {
        logError("Error in task #" + std::to_string(taskId) + " callback: " + e.what());
        resultPromise.set_exception(std::current_exception());
      }
    };

    // Queue the callback to be executed on the main thread
    tsfn.BlockingCall(callback);

    // Wait for the result
    try {
      result = resultFuture.get();

      logTrace("Task #" + std::to_string(taskId) + " result retrieved from future");
    } catch (const std::exception& e) {
      logError("Exception getting task #" + std::to_string(taskId) + " result: " + e.what());
      // Propagate exception
      throw;
    }

    // Release the thread-safe function
    tsfn.Release();
    logTrace("Released thread-safe function for task #" + std::to_string(taskId));

    return result;
  };

  // Add the task to the queue
  {
    std::unique_lock<std::mutex> lock(queueMutex_);
    tasks_.push(Task{taskId, taskFunction, priority});

    // Update metrics
    metrics_.submittedTasks++;
    metrics_.totalQueuedTasks++;

    // Only log every 1000th task to prevent spam
    if (taskId % 1000 == 0) {
      std::stringstream ss;
      ss << "Task #" << taskId << " queued with " << priorityStr << " priority (queue size: " << tasks_.size() << ")";
      logInfo(ss.str());
    }
  }

  // Notify a worker thread
  condition_.notify_one();
  logTrace("Notified worker thread for task #" + std::to_string(taskId));

  // Return the promise
  return promise;
}

/**
 * Get detailed queue statistics
 */
Napi::Value ThreadPool::GetQueueStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object stats = Napi::Object::New(env);

  // Get queue size with mutex protection
  std::unique_lock<std::mutex> queueLock(queueMutex_);
  stats.Set("queueSize", Napi::Number::New(env, tasks_.size()));
  queueLock.unlock();

  // Get task status counts
  uint32_t queuedCount = 0;
  uint32_t runningCount = 0;
  uint32_t completedCount = 0;
  uint32_t failedCount = 0;
  uint32_t cancelledCount = 0;

  std::unique_lock<std::mutex> resultsLock(resultsMutex_);
  for (const auto& pair : taskStatus_) {
    switch (pair.second) {
      case TaskStatus::QUEUED:
        queuedCount++;
        break;
      case TaskStatus::RUNNING:
        runningCount++;
        break;
      case TaskStatus::COMPLETED:
        completedCount++;
        break;
      case TaskStatus::FAILED:
        failedCount++;
        break;
      case TaskStatus::CANCELLED:
        cancelledCount++;
        break;
    }
  }
  resultsLock.unlock();

  stats.Set("queuedTasks", Napi::Number::New(env, queuedCount));
  stats.Set("runningTasks", Napi::Number::New(env, runningCount));
  stats.Set("completedTasks", Napi::Number::New(env, completedCount));
  stats.Set("failedTasks", Napi::Number::New(env, failedCount));
  stats.Set("cancelledTasks", Napi::Number::New(env, cancelledCount));
  stats.Set("activeCount", Napi::Number::New(env, activeCount_));
  stats.Set("workerCount", Napi::Number::New(env, workers_.size()));

  return stats;
}

} // namespace nexurejs
