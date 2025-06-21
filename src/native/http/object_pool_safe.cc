#include <napi.h>
#include <vector>
#include <memory>
#include <unordered_set>

namespace nexurejs {

class SafeObjectPool : public Napi::ObjectWrap<SafeObjectPool> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  SafeObjectPool(const Napi::CallbackInfo& info);
  ~SafeObjectPool() = default;

private:
  // Pool management methods
  Napi::Value CreateObject(const Napi::CallbackInfo& info);
  Napi::Value ReleaseObject(const Napi::CallbackInfo& info);
  Napi::Value GetBuffer(const Napi::CallbackInfo& info);
  Napi::Value ReleaseBuffer(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  Napi::Value GetPoolInfo(const Napi::CallbackInfo& info);

  // Safe pool operations
  Napi::Object CreateSafeObject(Napi::Env env);
  bool IsValidPooledObject(const Napi::Value& obj);
  void ClearObject(Napi::Object obj, Napi::Env env);

  // Pool configuration
  size_t maxPoolSize_ = 1000;
  size_t maxBufferSize_ = 64 * 1024; // 64KB max buffer
  bool enabled_ = true;

  // Pool storage
  std::vector<Napi::ObjectReference> availableObjects_;
  std::vector<Napi::Reference<Napi::Buffer<uint8_t>>> availableBuffers_;
  std::unordered_set<void*> activeObjects_;

  // Metrics
  uint64_t objectsCreated_ = 0;
  uint64_t objectsReused_ = 0;
  uint64_t buffersCreated_ = 0;
  uint64_t buffersReused_ = 0;
};

Napi::FunctionReference SafeObjectPool::constructor;

Napi::Object SafeObjectPool::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "ObjectPool", {
    InstanceMethod("createObject", &SafeObjectPool::CreateObject),
    InstanceMethod("releaseObject", &SafeObjectPool::ReleaseObject),
    InstanceMethod("getBuffer", &SafeObjectPool::GetBuffer),
    InstanceMethod("releaseBuffer", &SafeObjectPool::ReleaseBuffer),
    InstanceMethod("reset", &SafeObjectPool::Reset),
    InstanceMethod("getPoolInfo", &SafeObjectPool::GetPoolInfo)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("ObjectPool", func);
  return exports;
}

SafeObjectPool::SafeObjectPool(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<SafeObjectPool>(info) {

  Napi::Env env = info.Env();

  // Parse options safely
  if (info.Length() > 0 && info[0].IsObject()) {
    try {
      Napi::Object options = info[0].As<Napi::Object>();

      if (options.Has("maxPoolSize") && options.Get("maxPoolSize").IsNumber()) {
        uint32_t size = options.Get("maxPoolSize").As<Napi::Number>().Uint32Value();
        if (size > 0 && size <= 10000) { // Reasonable limits
          maxPoolSize_ = size;
        }
      }

      if (options.Has("maxBufferSize") && options.Get("maxBufferSize").IsNumber()) {
        uint32_t size = options.Get("maxBufferSize").As<Napi::Number>().Uint32Value();
        if (size > 0 && size <= 1024 * 1024) { // Max 1MB
          maxBufferSize_ = size;
        }
      }

      if (options.Has("enabled") && options.Get("enabled").IsBoolean()) {
        enabled_ = options.Get("enabled").As<Napi::Boolean>().Value();
      }
    } catch (...) {
      // Ignore options parsing errors, use defaults
    }
  }

  // Reserve space for pools
  availableObjects_.reserve(maxPoolSize_);
  availableBuffers_.reserve(maxPoolSize_);
}

Napi::Value SafeObjectPool::CreateObject(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  try {
    // If pooling is disabled, create new object
    if (!enabled_) {
      objectsCreated_++;
      return CreateSafeObject(env);
    }

    // Try to reuse an object from the pool
    if (!availableObjects_.empty()) {
      Napi::ObjectReference objRef = std::move(availableObjects_.back());
      availableObjects_.pop_back();

      Napi::Object obj = objRef.Value();

      // Clear the object for reuse
      ClearObject(obj, env);

      // Track as active using object's raw pointer
      activeObjects_.insert(reinterpret_cast<void*>(obj.operator napi_value()));
      objectsReused_++;

      return obj;
    }

    // Pool is empty or we haven't reached max size, create new
    if (availableObjects_.size() + activeObjects_.size() < maxPoolSize_) {
      Napi::Object obj = CreateSafeObject(env);
      activeObjects_.insert(reinterpret_cast<void*>(obj.operator napi_value()));
      objectsCreated_++;
      return obj;
    }

    // Pool is full, create temporary object (not pooled)
    objectsCreated_++;
    return CreateSafeObject(env);

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Failed to create object: ") + e.what()).ThrowAsJavaScriptException();
    return env.Null();
  } catch (...) {
    Napi::Error::New(env, "Unknown error creating object").ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value SafeObjectPool::ReleaseObject(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected object to release").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  try {
    Napi::Object obj = info[0].As<Napi::Object>();

    // If pooling is disabled, do nothing
    if (!enabled_) {
      return env.Undefined();
    }

    // Check if this object is tracked as active using raw pointer
    void* objPtr = reinterpret_cast<void*>(obj.operator napi_value());
    auto it = activeObjects_.find(objPtr);
    if (it == activeObjects_.end()) {
      // Object not from this pool, ignore
      return env.Undefined();
    }

    // Remove from active set
    activeObjects_.erase(it);

    // If pool has space, add back to available pool
    if (availableObjects_.size() < maxPoolSize_) {
      ClearObject(obj, env);
      availableObjects_.emplace_back(Napi::Persistent(obj));
    }

    return env.Undefined();

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Failed to release object: ") + e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  } catch (...) {
    Napi::Error::New(env, "Unknown error releasing object").ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

Napi::Value SafeObjectPool::GetBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  size_t size = 1024; // Default size

  if (info.Length() > 0 && info[0].IsNumber()) {
    uint32_t requestedSize = info[0].As<Napi::Number>().Uint32Value();
    if (requestedSize > 0 && requestedSize <= maxBufferSize_) {
      size = requestedSize;
    }
  }

  try {
    // Try to reuse a buffer from the pool
    if (!availableBuffers_.empty()) {
      auto bufferRef = std::move(availableBuffers_.back());
      availableBuffers_.pop_back();

      auto buffer = bufferRef.Value();

      // Check if buffer is large enough
      if (buffer.Length() >= size) {
        buffersReused_++;
        return buffer;
      }
    }

    // Create new buffer
    auto buffer = Napi::Buffer<uint8_t>::New(env, size);
    buffersCreated_++;
    return buffer;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Failed to get buffer: ") + e.what()).ThrowAsJavaScriptException();
    return env.Null();
  } catch (...) {
    Napi::Error::New(env, "Unknown error getting buffer").ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value SafeObjectPool::ReleaseBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected buffer to release").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  try {
    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();

    // If pooling is disabled, do nothing
    if (!enabled_) {
      return env.Undefined();
    }

    // If pool has space and buffer is reasonable size, add to pool
    if (availableBuffers_.size() < maxPoolSize_ &&
        buffer.Length() <= maxBufferSize_ &&
        buffer.Length() >= 64) { // Min size for pooling

      availableBuffers_.emplace_back(Napi::Persistent(buffer));
    }

    return env.Undefined();

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Failed to release buffer: ") + e.what()).ThrowAsJavaScriptException();
    return env.Undefined();
  } catch (...) {
    Napi::Error::New(env, "Unknown error releasing buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

Napi::Value SafeObjectPool::Reset(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  try {
    // Clear all pools
    availableObjects_.clear();
    availableBuffers_.clear();
    activeObjects_.clear();

    // Reset metrics
    objectsCreated_ = 0;
    objectsReused_ = 0;
    buffersCreated_ = 0;
    buffersReused_ = 0;

    return env.Undefined();

  } catch (...) {
    Napi::Error::New(env, "Error resetting pool").ThrowAsJavaScriptException();
    return env.Undefined();
  }
}

Napi::Value SafeObjectPool::GetPoolInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object info_obj = Napi::Object::New(env);

  try {
    info_obj.Set("enabled", Napi::Boolean::New(env, enabled_));
    info_obj.Set("maxPoolSize", Napi::Number::New(env, maxPoolSize_));
    info_obj.Set("maxBufferSize", Napi::Number::New(env, maxBufferSize_));
    info_obj.Set("availableObjects", Napi::Number::New(env, availableObjects_.size()));
    info_obj.Set("availableBuffers", Napi::Number::New(env, availableBuffers_.size()));
    info_obj.Set("activeObjects", Napi::Number::New(env, activeObjects_.size()));
    info_obj.Set("objectsCreated", Napi::Number::New(env, objectsCreated_));
    info_obj.Set("objectsReused", Napi::Number::New(env, objectsReused_));
    info_obj.Set("buffersCreated", Napi::Number::New(env, buffersCreated_));
    info_obj.Set("buffersReused", Napi::Number::New(env, buffersReused_));

    return info_obj;

  } catch (...) {
    Napi::Error::New(env, "Error getting pool info").ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Object SafeObjectPool::CreateSafeObject(Napi::Env env) {
  Napi::Object obj = Napi::Object::New(env);

  // Initialize with common HTTP request properties
  obj.Set("method", env.Null());
  obj.Set("url", env.Null());
  obj.Set("path", env.Null());
  obj.Set("query", env.Null());
  obj.Set("headers", Napi::Object::New(env));
  obj.Set("body", env.Null());
  obj.Set("complete", Napi::Boolean::New(env, false));

  return obj;
}

void SafeObjectPool::ClearObject(Napi::Object obj, Napi::Env env) {
  try {
    // Reset all properties to default values
    obj.Set("method", env.Null());
    obj.Set("url", env.Null());
    obj.Set("path", env.Null());
    obj.Set("query", env.Null());
    obj.Set("headers", Napi::Object::New(env));
    obj.Set("body", env.Null());
    obj.Set("complete", Napi::Boolean::New(env, false));
  } catch (...) {
    // Ignore errors during cleanup
  }
}

} // namespace nexurejs
