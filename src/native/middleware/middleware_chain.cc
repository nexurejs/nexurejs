#include <napi.h>
#include <vector>
#include <string>
#include <chrono>
#include <memory>
#include <mutex>
#include <atomic>

namespace nexurejs {

/**
 * MiddlewareChain - FIXED VERSION
 * High-performance middleware execution chain with proper V8 handling
 */
class MiddlewareChain : public Napi::ObjectWrap<MiddlewareChain> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  MiddlewareChain(const Napi::CallbackInfo& info);
  ~MiddlewareChain();

private:
  // Middleware entry
  struct MiddlewareEntry {
    Napi::FunctionReference function;
    std::string name;
    std::atomic<uint64_t> callCount{0};
    std::atomic<uint64_t> totalTimeUs{0};
  };

  // Properties
  std::vector<std::unique_ptr<MiddlewareEntry>> middlewares_;
  size_t maxChainLength_;
  std::mutex chainMutex_;

  // Metrics
  std::atomic<uint64_t> totalExecutions_{0};
  std::atomic<uint64_t> totalExecutionTimeUs_{0};

  // Methods exposed to JS
  Napi::Value Use(const Napi::CallbackInfo& info);
  Napi::Value Execute(const Napi::CallbackInfo& info);
  Napi::Value Clear(const Napi::CallbackInfo& info);
  Napi::Value GetCount(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  Napi::Value Remove(const Napi::CallbackInfo& info);
};

// Static members
Napi::FunctionReference MiddlewareChain::constructor;

// Initialize the module
Napi::Object MiddlewareChain::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "MiddlewareChain", {
    InstanceMethod("use", &MiddlewareChain::Use),
    InstanceMethod("execute", &MiddlewareChain::Execute),
    InstanceMethod("clear", &MiddlewareChain::Clear),
    InstanceMethod("getCount", &MiddlewareChain::GetCount),
    InstanceMethod("getMetrics", &MiddlewareChain::GetMetrics),
    InstanceMethod("remove", &MiddlewareChain::Remove),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("MiddlewareChain", func);
  return exports;
}

// Constructor
MiddlewareChain::MiddlewareChain(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<MiddlewareChain>(info) {
  maxChainLength_ = 100; // Default max chain length

  // Parse options if provided
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("maxChainLength") && options.Get("maxChainLength").IsNumber()) {
      maxChainLength_ = options.Get("maxChainLength").As<Napi::Number>().Uint32Value();
    }
  }
}

// Destructor
MiddlewareChain::~MiddlewareChain() {
  std::lock_guard<std::mutex> lock(chainMutex_);
  middlewares_.clear();
}

// Add middleware to the chain
Napi::Value MiddlewareChain::Use(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Function expected as middleware").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(chainMutex_);

  if (middlewares_.size() >= maxChainLength_) {
    Napi::Error::New(env, "Maximum middleware chain length exceeded").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get middleware function
  Napi::Function fn = info[0].As<Napi::Function>();

  // Get optional name
  std::string name = "middleware_" + std::to_string(middlewares_.size());
  if (info.Length() >= 2 && info[1].IsString()) {
    name = info[1].As<Napi::String>().Utf8Value();
  }

  // Create middleware entry
  auto entry = std::make_unique<MiddlewareEntry>();
  entry->function = Napi::Persistent(fn);
  entry->name = name;

  middlewares_.push_back(std::move(entry));

  return Napi::Number::New(env, middlewares_.size() - 1);
}

// Execute middleware chain - Simplified synchronous version
Napi::Value MiddlewareChain::Execute(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto startTime = std::chrono::high_resolution_clock::now();

  // Get context (req, res objects typically)
  Napi::Value req = info.Length() > 0 ? info[0] : env.Undefined();
  Napi::Value res = info.Length() > 1 ? info[1] : env.Undefined();

  // Create result object
  Napi::Object result = Napi::Object::New(env);
  result.Set("completed", Napi::Boolean::New(env, false));
  result.Set("error", env.Undefined());

  // Lock for reading middleware list
  std::vector<MiddlewareEntry*> currentMiddlewares;
  {
    std::lock_guard<std::mutex> lock(chainMutex_);
    for (auto& mw : middlewares_) {
      currentMiddlewares.push_back(mw.get());
    }
  }

  if (currentMiddlewares.empty()) {
    result.Set("completed", Napi::Boolean::New(env, true));
    return result;
  }

  // Execute middleware chain synchronously
  bool stopped = false;

  for (size_t i = 0; i < currentMiddlewares.size() && !stopped; i++) {
    auto* middleware = currentMiddlewares[i];
    auto mwStartTime = std::chrono::high_resolution_clock::now();

    try {
      // Create a simple next callback
      bool nextCalled = false;
      Napi::Value errorValue = env.Undefined();

      Napi::Function nextFn = Napi::Function::New(env, [&](const Napi::CallbackInfo& info) {
        nextCalled = true;
        if (info.Length() > 0 && !info[0].IsUndefined()) {
          errorValue = info[0];
          stopped = true;
        }
        return env.Undefined();
      });

      // Call the middleware
      middleware->function.Call({req, res, nextFn});

      // Check if next was called
      if (!nextCalled && i < currentMiddlewares.size() - 1) {
        // Middleware didn't call next, stop chain
        stopped = true;
      }

      // Check for errors
      if (!errorValue.IsUndefined()) {
        result.Set("error", errorValue);
      }

      // Update metrics
      auto mwEndTime = std::chrono::high_resolution_clock::now();
      auto duration = std::chrono::duration_cast<std::chrono::microseconds>(mwEndTime - mwStartTime).count();
      middleware->callCount++;
      middleware->totalTimeUs += duration;

    } catch (const Napi::Error& e) {
      result.Set("error", e.Value());
      stopped = true;
    } catch (...) {
      result.Set("error", Napi::String::New(env, "Unknown error in middleware"));
      stopped = true;
    }
  }

  result.Set("completed", Napi::Boolean::New(env, !stopped || result.Get("error").IsUndefined()));

  // Update total metrics
  auto endTime = std::chrono::high_resolution_clock::now();
  auto totalDuration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();
  totalExecutions_++;
  totalExecutionTimeUs_ += totalDuration;

  return result;
}

// Clear all middleware
Napi::Value MiddlewareChain::Clear(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(chainMutex_);
  middlewares_.clear();
  return info.Env().Undefined();
}

// Get middleware count
Napi::Value MiddlewareChain::GetCount(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(chainMutex_);
  return Napi::Number::New(info.Env(), middlewares_.size());
}

// Get metrics
Napi::Value MiddlewareChain::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object metrics = Napi::Object::New(env);

  metrics.Set("totalExecutions", Napi::Number::New(env, totalExecutions_.load()));
  metrics.Set("totalExecutionTimeMs", Napi::Number::New(env, totalExecutionTimeUs_.load() / 1000.0));

  if (totalExecutions_ > 0) {
    double avgTime = static_cast<double>(totalExecutionTimeUs_.load()) / totalExecutions_.load();
    metrics.Set("averageExecutionTimeUs", Napi::Number::New(env, avgTime));
  }

  // Add middleware-specific metrics
  Napi::Array middlewareMetrics = Napi::Array::New(env);
  {
    std::lock_guard<std::mutex> lock(chainMutex_);
    for (size_t i = 0; i < middlewares_.size(); i++) {
      Napi::Object mwMetric = Napi::Object::New(env);
      mwMetric.Set("name", Napi::String::New(env, middlewares_[i]->name));
      mwMetric.Set("callCount", Napi::Number::New(env, middlewares_[i]->callCount.load()));
      mwMetric.Set("totalTimeMs", Napi::Number::New(env, middlewares_[i]->totalTimeUs.load() / 1000.0));

      if (middlewares_[i]->callCount > 0) {
        double avgTime = static_cast<double>(middlewares_[i]->totalTimeUs.load()) / middlewares_[i]->callCount.load();
        mwMetric.Set("averageTimeUs", Napi::Number::New(env, avgTime));
      }

      middlewareMetrics.Set(i, mwMetric);
    }
  }
  metrics.Set("middlewares", middlewareMetrics);

  return metrics;
}

// Remove middleware at index
Napi::Value MiddlewareChain::Remove(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Index expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t index = info[0].As<Napi::Number>().Uint32Value();

  std::lock_guard<std::mutex> lock(chainMutex_);

  if (index >= middlewares_.size()) {
    Napi::RangeError::New(env, "Index out of bounds").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  middlewares_.erase(middlewares_.begin() + index);

  return Napi::Boolean::New(env, true);
}

} // namespace nexurejs
