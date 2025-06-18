#ifndef NEXUREJS_MIDDLEWARE_CHAIN_H
#define NEXUREJS_MIDDLEWARE_CHAIN_H

#include <napi.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <memory>
#include <atomic>
#include <mutex>

namespace nexurejs {

/**
 * MiddlewareChain - A high-performance middleware execution engine
 *
 * Features:
 * - Supports async and sync middleware functions
 * - Context passing between middleware
 * - Error handling with try/catch/next pattern
 * - Performance metrics tracking
 * - Named middleware for conditional execution
 */
class MiddlewareChain : public Napi::ObjectWrap<MiddlewareChain> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    MiddlewareChain(const Napi::CallbackInfo& info);
    ~MiddlewareChain();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
    // Middleware execution context
    struct MiddlewareContext {
        Napi::ObjectReference context;
        Napi::FunctionReference next;
        Napi::FunctionReference catchFn;
        Napi::FunctionReference finallyFn;
        size_t currentIndex;
        bool isComplete;
        bool hasError;
    };

    // Middleware definition
    struct Middleware {
        std::string name;
        Napi::FunctionReference fn;
        bool isAsync;
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> totalExecutions{0};
        std::atomic<uint64_t> successfulExecutions{0};
        std::atomic<uint64_t> failedExecutions{0};
        std::atomic<uint64_t> totalMiddlewareCount{0};
        std::atomic<uint64_t> totalExecutionTimeMs{0};
        std::atomic<uint64_t> maxExecutionTimeMs{0};
    };

    // Public JS methods
    Napi::Value Use(const Napi::CallbackInfo& info);
    Napi::Value UseAt(const Napi::CallbackInfo& info);
    Napi::Value Remove(const Napi::CallbackInfo& info);
    Napi::Value Execute(const Napi::CallbackInfo& info);
    Napi::Value ExecuteNamed(const Napi::CallbackInfo& info);
    Napi::Value Clear(const Napi::CallbackInfo& info);
    Napi::Value GetMiddleware(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Internal methods
    void executeMiddleware(const Napi::CallbackInfo& info, std::shared_ptr<MiddlewareContext> ctx);
    void executeNext(std::shared_ptr<MiddlewareContext> ctx, const std::vector<Middleware>& chain);
    void handleError(std::shared_ptr<MiddlewareContext> ctx, const Napi::Error& error);
    void updateMetrics(bool success, uint64_t executionTimeMs);

    // Member variables
    std::vector<Middleware> middlewareChain_;
    std::unordered_map<std::string, std::vector<Middleware>> namedChains_;
    std::mutex chainMutex_;
    Metrics metrics_;
};

} // namespace nexurejs

#endif // NEXUREJS_MIDDLEWARE_CHAIN_H
