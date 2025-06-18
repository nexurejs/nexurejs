#ifndef NEXUREJS_PROTOCOL_BUFFERS_H
#define NEXUREJS_PROTOCOL_BUFFERS_H

#include <napi.h>
#include <string>
#include <map>
#include <unordered_map>
#include <vector>
#include <atomic>
#include <mutex>
#include <memory>

namespace nexurejs {

class ProtocolBuffers : public Napi::ObjectWrap<ProtocolBuffers> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    ProtocolBuffers(const Napi::CallbackInfo& info);
    ~ProtocolBuffers();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
    // Schema management
    struct SchemaField {
        std::string name;
        std::string type;
        bool repeated;
        bool required;
        std::string defaultValue;
    };

    struct Schema {
        std::string name;
        std::vector<SchemaField> fields;
        bool hasValidation;
    };

    // Message cache for frequently used messages
    struct MessageTemplate {
        std::shared_ptr<Schema> schema;
        std::vector<uint8_t> wireFormat;
        size_t size;
        std::chrono::time_point<std::chrono::steady_clock> lastUsed;
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> totalMessagesSerialized{0};
        std::atomic<uint64_t> totalMessagesDeserialized{0};
        std::atomic<uint64_t> totalBytesSerialized{0};
        std::atomic<uint64_t> totalBytesDeserialized{0};
        std::atomic<uint64_t> cacheMisses{0};
        std::atomic<uint64_t> cacheHits{0};
        std::atomic<uint64_t> validationErrors{0};
        std::atomic<uint64_t> totalSchemas{0};
        std::atomic<uint64_t> maxMessageSize{0};
        std::atomic<uint64_t> totalEncodingTimeUs{0};
        std::atomic<uint64_t> totalDecodingTimeUs{0};
    };

    // Public JS methods
    Napi::Value RegisterSchema(const Napi::CallbackInfo& info);
    Napi::Value Serialize(const Napi::CallbackInfo& info);
    Napi::Value Deserialize(const Napi::CallbackInfo& info);
    Napi::Value GetSchema(const Napi::CallbackInfo& info);
    Napi::Value RemoveSchema(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Internal methods
    bool validateSchema(const Napi::Object& schemaObj);
    bool validateMessage(const Napi::Object& message, const std::shared_ptr<Schema>& schema);
    std::vector<uint8_t> encodeMessage(const Napi::Object& message, const std::shared_ptr<Schema>& schema);
    Napi::Object decodeMessage(const std::vector<uint8_t>& buffer, const std::shared_ptr<Schema>& schema, Napi::Env env);
    std::shared_ptr<Schema> getSchemaByName(const std::string& name);
    void clearMessageCache(const std::string& schemaName = "");

    // Member variables
    std::unordered_map<std::string, std::shared_ptr<Schema>> schemas_;
    std::unordered_map<std::string, std::shared_ptr<MessageTemplate>> messageCache_;
    size_t maxCacheSize_;
    size_t cacheTtlMs_;
    bool useCompression_;
    int compressionLevel_;
    Metrics metrics_;
    std::mutex schemasMutex_;
    std::mutex cacheMutex_;
};

} // namespace nexurejs

#endif // NEXUREJS_PROTOCOL_BUFFERS_H
