#include "stream_processor.h"
#include <string>
#include <memory>
#include <mutex>
#include <chrono>
#include <algorithm>

namespace nexurejs {

// Static member initialization
static Napi::FunctionReference constructor;

Napi::Object StreamProcessor::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "StreamProcessor", {
    InstanceMethod("processData", &StreamProcessor::ProcessData),
    InstanceMethod("processChunk", &StreamProcessor::ProcessChunk),
    InstanceMethod("flush", &StreamProcessor::Flush),
    InstanceMethod("getBufferSize", &StreamProcessor::GetBufferSize),
    InstanceMethod("getMetrics", &StreamProcessor::GetMetrics),
    InstanceMethod("resetMetrics", &StreamProcessor::ResetMetrics),
    InstanceMethod("setOptions", &StreamProcessor::SetOptions),
    StaticMethod("getInstance", &StreamProcessor::GetInstance),
    StaticMethod("resetMetrics", &StreamProcessor::ResetMetricsStatic),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  // Store the constructor in env instance data for later use
  env.SetInstanceData<Napi::FunctionReference>(new Napi::FunctionReference(Napi::Persistent(func)));

  exports.Set("StreamProcessor", func);
  return exports;
}

StreamProcessor::StreamProcessor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<StreamProcessor>(info),
      chunkSize_(4096),
      maxBufferSize_(1024 * 1024), // 1MB default
      autoFlush_(true),
      flushInterval_(1000), // 1 second
      totalBytesProcessed_(0),
      totalChunksProcessed_(0),
      totalProcessingTime_(0),
      maxProcessingTime_(0),
      totalFlushes_(0),
      bufferOverflows_(0),
      lastFlushTime_(std::chrono::steady_clock::now()) {

    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Process options if provided
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object options = info[0].As<Napi::Object>();

        if (options.Has("chunkSize") && options.Get("chunkSize").IsNumber()) {
            chunkSize_ = options.Get("chunkSize").As<Napi::Number>().Uint32Value();
        }

        if (options.Has("maxBufferSize") && options.Get("maxBufferSize").IsNumber()) {
            maxBufferSize_ = options.Get("maxBufferSize").As<Napi::Number>().Uint32Value();
        }

        if (options.Has("autoFlush") && options.Get("autoFlush").IsBoolean()) {
            autoFlush_ = options.Get("autoFlush").As<Napi::Boolean>().Value();
        }

        if (options.Has("flushInterval") && options.Get("flushInterval").IsNumber()) {
            flushInterval_ = options.Get("flushInterval").As<Napi::Number>().Uint32Value();
        }
    }

    // Initialize buffer with enough capacity
    buffer_.reserve(maxBufferSize_);
}

StreamProcessor::~StreamProcessor() {
    // Ensure any remaining data is flushed
    std::lock_guard<std::mutex> lock(bufferMutex_);
    buffer_.clear();
}

Napi::Value StreamProcessor::GetInstance(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    static Napi::ObjectReference instance;
    if (instance.IsEmpty()) {
        // Create default StreamProcessor instance if not already created
        Napi::Object obj = env.GetInstanceData<Napi::FunctionReference>()->New({});
        instance = Napi::Persistent(obj);
    }

    return instance.Value();
}

Napi::Value StreamProcessor::ResetMetricsStatic(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Get the singleton instance and reset its metrics
    Napi::Value instance = GetInstance(info);
    if (instance.IsObject()) {
        Napi::Object obj = instance.As<Napi::Object>();
        StreamProcessor* processor = Napi::ObjectWrap<StreamProcessor>::Unwrap(obj);
        if (processor) {
            processor->ResetMetrics(info);
        }
    }

    return env.Undefined();
}

Napi::Value StreamProcessor::ProcessData(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    bool forceFlush = false;

    if (info.Length() > 1 && info[1].IsBoolean()) {
        forceFlush = info[1].As<Napi::Boolean>().Value();
    }

    auto start = std::chrono::steady_clock::now();

    // Process the data
    size_t size = buffer.Length();
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);

        // Check if buffer would overflow
        if (buffer_.size() + size > maxBufferSize_) {
            bufferOverflows_++;

            // Either flush or truncate
            if (autoFlush_) {
                // Perform internal flush logic
                buffer_.clear();
                totalFlushes_++;
            } else {
                // Truncate new data to fit
                size = maxBufferSize_ - buffer_.size();
            }
        }

        // Add data to buffer
        buffer_.insert(buffer_.end(), buffer.Data(), buffer.Data() + size);

        // Auto-flush check
        auto now = std::chrono::steady_clock::now();
        bool timeToFlush = autoFlush_ &&
            std::chrono::duration_cast<std::chrono::milliseconds>(now - lastFlushTime_).count() >= flushInterval_;

        if (forceFlush || timeToFlush) {
            // Perform internal flush logic
            buffer_.clear();
            lastFlushTime_ = now;
            totalFlushes_++;
        }
    }

    auto end = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

    // Update metrics
    totalBytesProcessed_ += size;
    totalChunksProcessed_++;
    totalProcessingTime_ += duration;

    uint32_t durationMs = static_cast<uint32_t>(duration / 1000);
    uint32_t currentMax = maxProcessingTime_.load();
    while(durationMs > currentMax) {
        if (maxProcessingTime_.compare_exchange_weak(currentMax, durationMs)) {
            break;
        }
    }

    return Napi::Number::New(env, size);
}

Napi::Value StreamProcessor::ProcessChunk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();

    auto start = std::chrono::steady_clock::now();

    // Process in chunks
    size_t totalProcessed = 0;
    size_t remaining = buffer.Length();
    const uint8_t* data = buffer.Data();

    while (remaining > 0) {
        size_t chunkSize = std::min(remaining, chunkSize_);

        // Process the chunk
        {
            std::lock_guard<std::mutex> lock(bufferMutex_);

            // Check if buffer would overflow
            if (buffer_.size() + chunkSize > maxBufferSize_) {
                bufferOverflows_++;

                // Either flush or truncate
                if (autoFlush_) {
                    // Perform internal flush logic
                    buffer_.clear();
                    totalFlushes_++;
                } else {
                    // Truncate new data to fit
                    chunkSize = maxBufferSize_ - buffer_.size();
                    if (chunkSize == 0) break;
                }
            }

            // Add chunk to buffer
            buffer_.insert(buffer_.end(), data, data + chunkSize);
        }

        // Update for next iteration
        data += chunkSize;
        remaining -= chunkSize;
        totalProcessed += chunkSize;
        totalChunksProcessed_++;
    }

    auto end = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

    // Update metrics
    totalBytesProcessed_ += totalProcessed;
    totalProcessingTime_ += duration;

    uint32_t durationMs = static_cast<uint32_t>(duration / 1000);
    uint32_t currentMax = maxProcessingTime_.load();
    while(durationMs > currentMax) {
        if (maxProcessingTime_.compare_exchange_weak(currentMax, durationMs)) {
            break;
        }
    }

    return Napi::Number::New(env, totalProcessed);
}

Napi::Value StreamProcessor::Flush(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    size_t flushedSize;
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);
        flushedSize = buffer_.size();
        buffer_.clear();
        lastFlushTime_ = std::chrono::steady_clock::now();
        totalFlushes_++;
    }

    return Napi::Number::New(env, flushedSize);
}

Napi::Value StreamProcessor::GetBufferSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    std::lock_guard<std::mutex> lock(bufferMutex_);
    return Napi::Number::New(env, buffer_.size());
}

Napi::Value StreamProcessor::GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    Napi::Object metrics = Napi::Object::New(env);

    // Performance metrics
    metrics.Set("totalBytesProcessed", Napi::Number::New(env, totalBytesProcessed_));
    metrics.Set("totalChunksProcessed", Napi::Number::New(env, totalChunksProcessed_));
    metrics.Set("totalProcessingTime", Napi::Number::New(env, totalProcessingTime_));
    metrics.Set("maxProcessingTime", Napi::Number::New(env, maxProcessingTime_));
    metrics.Set("totalFlushes", Napi::Number::New(env, totalFlushes_));
    metrics.Set("bufferOverflows", Napi::Number::New(env, bufferOverflows_));

    // Current state
    metrics.Set("currentBufferSize", Napi::Number::New(env, buffer_.size()));
    metrics.Set("bufferUtilization", Napi::Number::New(env, (double)buffer_.size() / maxBufferSize_));

    return metrics;
}

Napi::Value StreamProcessor::ResetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    totalBytesProcessed_ = 0;
    totalChunksProcessed_ = 0;
    totalProcessingTime_ = 0;
    maxProcessingTime_ = 0;
    totalFlushes_ = 0;
    bufferOverflows_ = 0;

    return env.Undefined();
}

Napi::Value StreamProcessor::SetOptions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected for options").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object options = info[0].As<Napi::Object>();
    std::lock_guard<std::mutex> lock(bufferMutex_);

    if (options.Has("chunkSize") && options.Get("chunkSize").IsNumber()) {
        chunkSize_ = options.Get("chunkSize").As<Napi::Number>().Uint32Value();
    }

    if (options.Has("maxBufferSize") && options.Get("maxBufferSize").IsNumber()) {
        size_t newMaxSize = options.Get("maxBufferSize").As<Napi::Number>().Uint32Value();

        // If decreasing buffer size, make sure we're not above new max
        if (newMaxSize < maxBufferSize_ && buffer_.size() > newMaxSize) {
            buffer_.resize(newMaxSize);
        }

        maxBufferSize_ = newMaxSize;
        buffer_.reserve(maxBufferSize_);
    }

    if (options.Has("autoFlush") && options.Get("autoFlush").IsBoolean()) {
        autoFlush_ = options.Get("autoFlush").As<Napi::Boolean>().Value();
    }

    if (options.Has("flushInterval") && options.Get("flushInterval").IsNumber()) {
        flushInterval_ = options.Get("flushInterval").As<Napi::Number>().Uint32Value();
    }

    return env.Undefined();
}

} // namespace nexurejs
