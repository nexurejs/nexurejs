#include <napi.h>
#include <string>
#include <unordered_map>
#include <vector>
#include <atomic>
#include <mutex>
#include <chrono>
#include <algorithm>
#include <memory>
#include <sstream>
#include "protocol_buffers.h"

namespace nexurejs {

Napi::FunctionReference ProtocolBuffers::constructor;

// Forward declaration for the helper function
void encodeValue(const Napi::Value& value, const std::string& type, std::vector<uint8_t>& result);

// Forward declarations for helper functions
void encodeValue(const Napi::Value& value, const std::string& type, std::vector<uint8_t>& result);
Napi::Value decodeValue(const std::vector<uint8_t>& buffer, size_t& pos, const std::string& type, Napi::Env env);

Napi::Object ProtocolBuffers::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "ProtocolBuffers", {
        InstanceMethod("registerSchema", &ProtocolBuffers::RegisterSchema),
        InstanceMethod("serialize", &ProtocolBuffers::Serialize),
        InstanceMethod("deserialize", &ProtocolBuffers::Deserialize),
        InstanceMethod("getSchema", &ProtocolBuffers::GetSchema),
        InstanceMethod("removeSchema", &ProtocolBuffers::RemoveSchema),
        InstanceMethod("getMetrics", &ProtocolBuffers::GetMetrics),
        InstanceMethod("resetMetrics", &ProtocolBuffers::ResetMetrics),
        StaticMethod("getInstance", &ProtocolBuffers::GetInstance),
        StaticMethod("resetMetrics", &ProtocolBuffers::ResetMetricsStatic),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("ProtocolBuffers", func);
    return exports;
}

ProtocolBuffers::ProtocolBuffers(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<ProtocolBuffers>(info),
      maxCacheSize_(100),     // Default to caching 100 messages
      cacheTtlMs_(60000),     // Default to 1 minute cache TTL
      useCompression_(false), // Default to no compression
      compressionLevel_(6) {  // Default compression level (medium)

    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Process options if provided
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object options = info[0].As<Napi::Object>();

        if (options.Has("maxCacheSize") && options.Get("maxCacheSize").IsNumber()) {
            maxCacheSize_ = options.Get("maxCacheSize").As<Napi::Number>().Uint32Value();
        }

        if (options.Has("cacheTtlMs") && options.Get("cacheTtlMs").IsNumber()) {
            cacheTtlMs_ = options.Get("cacheTtlMs").As<Napi::Number>().Uint32Value();
        }

        if (options.Has("useCompression") && options.Get("useCompression").IsBoolean()) {
            useCompression_ = options.Get("useCompression").As<Napi::Boolean>().Value();
        }

        if (options.Has("compressionLevel") && options.Get("compressionLevel").IsNumber()) {
            compressionLevel_ = options.Get("compressionLevel").As<Napi::Number>().Int32Value();
        }
    }
}

ProtocolBuffers::~ProtocolBuffers() {
    // Clean up any resources
    std::lock_guard<std::mutex> lockSchemas(schemasMutex_);
    schemas_.clear();

    std::lock_guard<std::mutex> lockCache(cacheMutex_);
    messageCache_.clear();
}

Napi::Value ProtocolBuffers::GetInstance(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    static Napi::ObjectReference instance;
    if (instance.IsEmpty()) {
        // Create default ProtocolBuffers instance if not already created
        Napi::Object obj = constructor.New({});
        instance = Napi::Persistent(obj);
    }

    return instance.Value();
}

Napi::Value ProtocolBuffers::ResetMetricsStatic(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Get the singleton instance and reset its metrics
    Napi::Value instance = GetInstance(info);
    if (instance.IsObject()) {
        Napi::Object obj = instance.As<Napi::Object>();
        ProtocolBuffers* pb = Napi::ObjectWrap<ProtocolBuffers>::Unwrap(obj);
        if (pb) {
            pb->ResetMetrics(info);
        }
    }

    return env.Undefined();
}

Napi::Value ProtocolBuffers::RegisterSchema(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Schema object expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object schemaObj = info[0].As<Napi::Object>();

    // Validate schema
    if (!validateSchema(schemaObj)) {
        Napi::Error::New(env, "Invalid schema format").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Extract schema name
    std::string name = schemaObj.Get("name").As<Napi::String>().Utf8Value();

    // Create the schema object
    auto schema = std::make_shared<Schema>();
    schema->name = name;
    schema->hasValidation = false;

    // Process fields
    Napi::Array fields = schemaObj.Get("fields").As<Napi::Array>();
    uint32_t fieldCount = fields.Length();
    schema->fields.reserve(fieldCount);

    for (uint32_t i = 0; i < fieldCount; i++) {
        Napi::Object fieldObj = fields.Get(i).As<Napi::Object>();
        SchemaField field;
        field.name = fieldObj.Get("name").As<Napi::String>().Utf8Value();
        field.type = fieldObj.Get("type").As<Napi::String>().Utf8Value();

        // Optional fields with defaults
        field.repeated = fieldObj.Has("repeated") && fieldObj.Get("repeated").IsBoolean()
            ? fieldObj.Get("repeated").As<Napi::Boolean>().Value() : false;

        field.required = fieldObj.Has("required") && fieldObj.Get("required").IsBoolean()
            ? fieldObj.Get("required").As<Napi::Boolean>().Value() : false;

        field.defaultValue = fieldObj.Has("default") && fieldObj.Get("default").IsString()
            ? fieldObj.Get("default").As<Napi::String>().Utf8Value() : "";

        // If any field has validation requirements, mark the schema
        if (field.required) {
            schema->hasValidation = true;
        }

        schema->fields.push_back(field);
    }

    // Register the schema
    {
        std::lock_guard<std::mutex> lock(schemasMutex_);

        // Clear the cache for this schema if it already exists
        if (schemas_.find(name) != schemas_.end()) {
            clearMessageCache(name);
        }

        schemas_[name] = schema;
        metrics_.totalSchemas++;
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value ProtocolBuffers::GetSchema(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Schema name (string) expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string name = info[0].As<Napi::String>().Utf8Value();
    std::shared_ptr<Schema> schema = getSchemaByName(name);

    if (!schema) {
        return env.Null();
    }

    // Convert the schema back to a JS object
    Napi::Object result = Napi::Object::New(env);
    result.Set("name", Napi::String::New(env, schema->name));

    Napi::Array fields = Napi::Array::New(env, schema->fields.size());
    for (size_t i = 0; i < schema->fields.size(); i++) {
        const auto& field = schema->fields[i];
        Napi::Object fieldObj = Napi::Object::New(env);
        fieldObj.Set("name", Napi::String::New(env, field.name));
        fieldObj.Set("type", Napi::String::New(env, field.type));

        if (field.repeated) {
            fieldObj.Set("repeated", Napi::Boolean::New(env, true));
        }

        if (field.required) {
            fieldObj.Set("required", Napi::Boolean::New(env, true));
        }

        if (!field.defaultValue.empty()) {
            fieldObj.Set("default", Napi::String::New(env, field.defaultValue));
        }

        fields.Set(i, fieldObj);
    }

    result.Set("fields", fields);
    return result;
}

Napi::Value ProtocolBuffers::RemoveSchema(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Schema name (string) expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string name = info[0].As<Napi::String>().Utf8Value();
    bool removed = false;

    {
        std::lock_guard<std::mutex> lock(schemasMutex_);
        auto it = schemas_.find(name);
        if (it != schemas_.end()) {
            schemas_.erase(it);
            clearMessageCache(name);
            removed = true;
        }
    }

    return Napi::Boolean::New(env, removed);
}

std::shared_ptr<ProtocolBuffers::Schema> ProtocolBuffers::getSchemaByName(const std::string& name) {
    std::lock_guard<std::mutex> lock(schemasMutex_);
    auto it = schemas_.find(name);
    if (it != schemas_.end()) {
        return it->second;
    }
    return nullptr;
}

bool ProtocolBuffers::validateSchema(const Napi::Object& schemaObj) {
    // Must have a name
    if (!schemaObj.Has("name") || !schemaObj.Get("name").IsString()) {
        return false;
    }

    // Must have fields array
    if (!schemaObj.Has("fields") || !schemaObj.Get("fields").IsArray()) {
        return false;
    }

    Napi::Array fields = schemaObj.Get("fields").As<Napi::Array>();
    uint32_t fieldCount = fields.Length();

    // Must have at least one field
    if (fieldCount == 0) {
        return false;
    }

    // Check each field
    for (uint32_t i = 0; i < fieldCount; i++) {
        if (!fields.Get(i).IsObject()) {
            return false;
        }

        Napi::Object fieldObj = fields.Get(i).As<Napi::Object>();

        // Each field must have a name and type
        if (!fieldObj.Has("name") || !fieldObj.Get("name").IsString() ||
            !fieldObj.Has("type") || !fieldObj.Get("type").IsString()) {
            return false;
        }

        // Verify the type is one we support
        std::string type = fieldObj.Get("type").As<Napi::String>().Utf8Value();
        if (type != "string" && type != "number" && type != "boolean" &&
            type != "object" && type != "array" && type != "buffer") {
            return false;
        }
    }

    return true;
}

void ProtocolBuffers::clearMessageCache(const std::string& schemaName) {
    std::lock_guard<std::mutex> lock(cacheMutex_);

    if (schemaName.empty()) {
        // Clear all cache
        messageCache_.clear();
        return;
    }

    // Clear cache for a specific schema
    auto it = messageCache_.begin();
    while (it != messageCache_.end()) {
        if (it->second->schema->name == schemaName) {
            it = messageCache_.erase(it);
        } else {
            ++it;
        }
    }
}

Napi::Value ProtocolBuffers::Serialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
        Napi::TypeError::New(env, "Expected schema name (string) and message (object)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string schemaName = info[0].As<Napi::String>().Utf8Value();
    Napi::Object message = info[1].As<Napi::Object>();

    // Get the schema
    auto schema = getSchemaByName(schemaName);
    if (!schema) {
        Napi::Error::New(env, "Schema not found").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    // Validate message against schema if validation is required
    if (schema->hasValidation && !validateMessage(message, schema)) {
        metrics_.validationErrors++;
        Napi::Error::New(env, "Message does not match schema").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Encode the message
    std::vector<uint8_t> encoded;
    try {
        encoded = encodeMessage(message, schema);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Serialization error: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }

    // Update metrics
    auto endTime = std::chrono::high_resolution_clock::now();
    auto durationMicros = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    metrics_.totalMessagesSerialized++;
    metrics_.totalBytesSerialized += encoded.size();
    metrics_.totalEncodingTimeUs += durationMicros;
    metrics_.maxMessageSize = std::max(metrics_.maxMessageSize.load(), static_cast<uint64_t>(encoded.size()));

    // Create a buffer to return
    Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, encoded.data(), encoded.size());
    return buffer;
}

Napi::Value ProtocolBuffers::Deserialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Expected schema name (string) and buffer").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string schemaName = info[0].As<Napi::String>().Utf8Value();
    Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();

    // Get the schema
    auto schema = getSchemaByName(schemaName);
    if (!schema) {
        Napi::Error::New(env, "Schema not found").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Start timing
    auto startTime = std::chrono::high_resolution_clock::now();

    // Convert buffer to vector
    std::vector<uint8_t> data(buffer.Data(), buffer.Data() + buffer.Length());

    // Decode the message
    Napi::Object result;
    try {
        result = decodeMessage(data, schema, env);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Deserialization error: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }

    // Update metrics
    auto endTime = std::chrono::high_resolution_clock::now();
    auto durationMicros = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    metrics_.totalMessagesDeserialized++;
    metrics_.totalBytesDeserialized += data.size();
    metrics_.totalDecodingTimeUs += durationMicros;

    return result;
}

Napi::Value ProtocolBuffers::GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    Napi::Object metrics = Napi::Object::New(env);
    metrics.Set("totalMessagesSerialized", Napi::Number::New(env, metrics_.totalMessagesSerialized));
    metrics.Set("totalMessagesDeserialized", Napi::Number::New(env, metrics_.totalMessagesDeserialized));
    metrics.Set("totalBytesSerialized", Napi::Number::New(env, metrics_.totalBytesSerialized));
    metrics.Set("totalBytesDeserialized", Napi::Number::New(env, metrics_.totalBytesDeserialized));
    metrics.Set("cacheMisses", Napi::Number::New(env, metrics_.cacheMisses));
    metrics.Set("cacheHits", Napi::Number::New(env, metrics_.cacheHits));
    metrics.Set("validationErrors", Napi::Number::New(env, metrics_.validationErrors));
    metrics.Set("totalSchemas", Napi::Number::New(env, metrics_.totalSchemas));
    metrics.Set("maxMessageSize", Napi::Number::New(env, metrics_.maxMessageSize));

    // Calculate average encoding/decoding times
    double avgEncodingTimeUs = 0;
    if (metrics_.totalMessagesSerialized > 0) {
        avgEncodingTimeUs = static_cast<double>(metrics_.totalEncodingTimeUs) /
                           static_cast<double>(metrics_.totalMessagesSerialized);
    }
    metrics.Set("avgEncodingTimeUs", Napi::Number::New(env, avgEncodingTimeUs));

    double avgDecodingTimeUs = 0;
    if (metrics_.totalMessagesDeserialized > 0) {
        avgDecodingTimeUs = static_cast<double>(metrics_.totalDecodingTimeUs) /
                           static_cast<double>(metrics_.totalMessagesDeserialized);
    }
    metrics.Set("avgDecodingTimeUs", Napi::Number::New(env, avgDecodingTimeUs));

    // Add cache information
    size_t cacheSize;
    {
        std::lock_guard<std::mutex> lock(cacheMutex_);
        cacheSize = messageCache_.size();
    }
    metrics.Set("cacheSize", Napi::Number::New(env, cacheSize));
    metrics.Set("maxCacheSize", Napi::Number::New(env, maxCacheSize_));

    return metrics;
}

Napi::Value ProtocolBuffers::ResetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    metrics_.totalMessagesSerialized = 0;
    metrics_.totalMessagesDeserialized = 0;
    metrics_.totalBytesSerialized = 0;
    metrics_.totalBytesDeserialized = 0;
    metrics_.cacheMisses = 0;
    metrics_.cacheHits = 0;
    metrics_.validationErrors = 0;
    metrics_.maxMessageSize = 0;
    metrics_.totalEncodingTimeUs = 0;
    metrics_.totalDecodingTimeUs = 0;

    return env.Undefined();
}

// Helper method to validate a message against a schema
bool ProtocolBuffers::validateMessage(const Napi::Object& message, const std::shared_ptr<Schema>& schema) {
    // Check each field in the schema
    for (const auto& field : schema->fields) {
        std::string name = field.name;

        // If the field is required, it must be present
        if (field.required && (!message.Has(name) || message.Get(name).IsNull() || message.Get(name).IsUndefined())) {
            return false;
        }

        // If the field is present, check its type
        if (message.Has(name) && !message.Get(name).IsNull() && !message.Get(name).IsUndefined()) {
            Napi::Value value = message.Get(name);

            // Check type matches
            if (field.type == "string" && !value.IsString()) {
                return false;
            } else if (field.type == "number" && !value.IsNumber()) {
                return false;
            } else if (field.type == "boolean" && !value.IsBoolean()) {
                return false;
            } else if (field.type == "object" && !value.IsObject()) {
                return false;
            } else if (field.type == "array" && !value.IsArray()) {
                return false;
            } else if (field.type == "buffer" && !value.IsBuffer()) {
                return false;
            }

            // Check array items if field is repeated
            if (field.repeated) {
                if (!value.IsArray()) {
                    return false;
                }

                Napi::Array array = value.As<Napi::Array>();
                uint32_t length = array.Length();

                for (uint32_t i = 0; i < length; i++) {
                    Napi::Value item = array.Get(i);

                    // Check item type
                    if (field.type == "string" && !item.IsString()) {
                        return false;
                    } else if (field.type == "number" && !item.IsNumber()) {
                        return false;
                    } else if (field.type == "boolean" && !item.IsBoolean()) {
                        return false;
                    } else if (field.type == "object" && !item.IsObject()) {
                        return false;
                    } else if (field.type == "buffer" && !item.IsBuffer()) {
                        return false;
                    }
                }
            }
        }
    }

    return true;
}

// Simple encoding implementation (in practice, this would be more sophisticated)
std::vector<uint8_t> ProtocolBuffers::encodeMessage(const Napi::Object& message, const std::shared_ptr<Schema>& schema) {
    std::vector<uint8_t> result;

    // This is a simplified implementation - in a real system you would use a proper encoding scheme
    // like Protocol Buffers or MessagePack. This is just to demonstrate the concept.

    // Add schema name length and schema name
    uint16_t nameLength = static_cast<uint16_t>(schema->name.length());
    result.push_back(nameLength & 0xFF);
    result.push_back((nameLength >> 8) & 0xFF);
    result.insert(result.end(), schema->name.begin(), schema->name.end());

    // Add field count
    uint16_t fieldCount = static_cast<uint16_t>(schema->fields.size());
    result.push_back(fieldCount & 0xFF);
    result.push_back((fieldCount >> 8) & 0xFF);

    // Add each field
    for (const auto& field : schema->fields) {
        // Field name
        uint16_t fieldNameLength = static_cast<uint16_t>(field.name.length());
        result.push_back(fieldNameLength & 0xFF);
        result.push_back((fieldNameLength >> 8) & 0xFF);
        result.insert(result.end(), field.name.begin(), field.name.end());

        // Field type code
        uint8_t typeCode = 0;
        if (field.type == "string") typeCode = 1;
        else if (field.type == "number") typeCode = 2;
        else if (field.type == "boolean") typeCode = 3;
        else if (field.type == "object") typeCode = 4;
        else if (field.type == "array") typeCode = 5;
        else if (field.type == "buffer") typeCode = 6;
        result.push_back(typeCode);

        // Is the field repeated?
        result.push_back(field.repeated ? 1 : 0);

        // Field value
        if (message.Has(field.name) && !message.Get(field.name).IsNull() && !message.Get(field.name).IsUndefined()) {
            // Field is present
            result.push_back(1);  // has value flag

            Napi::Value value = message.Get(field.name);

            if (field.repeated) {
                Napi::Array array = value.As<Napi::Array>();
                uint32_t length = array.Length();

                // Array length
                result.push_back(length & 0xFF);
                result.push_back((length >> 8) & 0xFF);
                result.push_back((length >> 16) & 0xFF);
                result.push_back((length >> 24) & 0xFF);

                // Array items
                for (uint32_t i = 0; i < length; i++) {
                    encodeValue(array.Get(i), field.type, result);
                }
            } else {
                encodeValue(value, field.type, result);
            }
        } else {
            // Field is not present
            result.push_back(0);  // no value flag
        }
    }

    return result;
}

// Helper to encode a single value
void encodeValue(const Napi::Value& value, const std::string& type, std::vector<uint8_t>& result) {
    if (type == "string") {
        std::string str = value.As<Napi::String>().Utf8Value();
        uint32_t length = static_cast<uint32_t>(str.length());

        // String length
        result.push_back(length & 0xFF);
        result.push_back((length >> 8) & 0xFF);
        result.push_back((length >> 16) & 0xFF);
        result.push_back((length >> 24) & 0xFF);

        // String data
        result.insert(result.end(), str.begin(), str.end());
    }
    else if (type == "number") {
        double num = value.As<Napi::Number>().DoubleValue();
        const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&num);
        result.insert(result.end(), bytes, bytes + sizeof(double));
    }
    else if (type == "boolean") {
        bool b = value.As<Napi::Boolean>().Value();
        result.push_back(b ? 1 : 0);
    }
    else if (type == "buffer") {
        Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();
        uint32_t length = buffer.Length();

        // Buffer length
        result.push_back(length & 0xFF);
        result.push_back((length >> 8) & 0xFF);
        result.push_back((length >> 16) & 0xFF);
        result.push_back((length >> 24) & 0xFF);

        // Buffer data
        result.insert(result.end(), buffer.Data(), buffer.Data() + length);
    }
    // For simplicity, we're not handling object or array types in this example
}

Napi::Object ProtocolBuffers::decodeMessage(const std::vector<uint8_t>& buffer, const std::shared_ptr<Schema>& schema, Napi::Env env) {
    Napi::Object result = Napi::Object::New(env);
    size_t pos = 0;

    // Skip schema name and validation since we already have the schema
    uint16_t nameLength = buffer[pos] | (buffer[pos + 1] << 8);
    pos += 2 + nameLength;

    // Get field count
    uint16_t fieldCount = buffer[pos] | (buffer[pos + 1] << 8);
    pos += 2;

    // Process each field
    for (uint16_t i = 0; i < fieldCount; i++) {
        // Get field name
        uint16_t fieldNameLength = buffer[pos] | (buffer[pos + 1] << 8);
        pos += 2;
        std::string fieldName(buffer.begin() + pos, buffer.begin() + pos + fieldNameLength);
        pos += fieldNameLength;

        // Get field type
        uint8_t typeCode = buffer[pos++];
        std::string fieldType;
        switch (typeCode) {
            case 1: fieldType = "string"; break;
            case 2: fieldType = "number"; break;
            case 3: fieldType = "boolean"; break;
            case 4: fieldType = "object"; break;
            case 5: fieldType = "array"; break;
            case 6: fieldType = "buffer"; break;
            default: throw std::runtime_error("Unknown field type");
        }

        // Is field repeated?
        bool repeated = buffer[pos++] == 1;

        // Has value?
        bool hasValue = buffer[pos++] == 1;

        if (hasValue) {
            if (repeated) {
                // Get array length
                uint32_t arrayLength = buffer[pos] |
                                      (buffer[pos + 1] << 8) |
                                      (buffer[pos + 2] << 16) |
                                      (buffer[pos + 3] << 24);
                pos += 4;

                // Create array
                Napi::Array array = Napi::Array::New(env, arrayLength);

                // Decode each array item
                for (uint32_t j = 0; j < arrayLength; j++) {
                    array.Set(j, decodeValue(buffer, pos, fieldType, env));
                }

                result.Set(fieldName, array);
            } else {
                // Decode single value
                result.Set(fieldName, decodeValue(buffer, pos, fieldType, env));
            }
        }
    }

    return result;
}

// Helper to decode a single value
Napi::Value decodeValue(const std::vector<uint8_t>& buffer, size_t& pos, const std::string& type, Napi::Env env) {
    if (type == "string") {
        // Get string length
        uint32_t length = buffer[pos] |
                         (buffer[pos + 1] << 8) |
                         (buffer[pos + 2] << 16) |
                         (buffer[pos + 3] << 24);
        pos += 4;

        // Get string data
        std::string str(buffer.begin() + pos, buffer.begin() + pos + length);
        pos += length;

        return Napi::String::New(env, str);
    }
    else if (type == "number") {
        // Get double value
        double value;
        std::memcpy(&value, &buffer[pos], sizeof(double));
        pos += sizeof(double);

        return Napi::Number::New(env, value);
    }
    else if (type == "boolean") {
        // Get boolean value
        bool value = buffer[pos++] == 1;

        return Napi::Boolean::New(env, value);
    }
    else if (type == "buffer") {
        // Get buffer length
        uint32_t length = buffer[pos] |
                         (buffer[pos + 1] << 8) |
                         (buffer[pos + 2] << 16) |
                         (buffer[pos + 3] << 24);
        pos += 4;

        // Create buffer with data
        Napi::Buffer<uint8_t> result = Napi::Buffer<uint8_t>::Copy(
            env, &buffer[pos], length);
        pos += length;

        return result;
    }

    // Fallback for unhandled types
    return env.Null();
}

} // namespace nexurejs
