#ifndef NEXUREJS_VALIDATION_ENGINE_H
#define NEXUREJS_VALIDATION_ENGINE_H

#include <napi.h>
#include <string>
#include <map>
#include <unordered_map>
#include <vector>
#include <atomic>
#include <mutex>
#include <memory>

namespace nexurejs {

class ValidationEngine : public Napi::ObjectWrap<ValidationEngine> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference constructor;

    ValidationEngine(const Napi::CallbackInfo& info);
    ~ValidationEngine();

    // Static methods for singleton access
    static Napi::Value GetInstance(const Napi::CallbackInfo& info);
    static Napi::Value ResetMetricsStatic(const Napi::CallbackInfo& info);

private:
    // Schema and validation rule structures
    struct ValidationRule {
        std::string type;        // type of rule (required, type, min, max, regex, etc.)
        std::string value;       // value for the rule
        std::string message;     // custom error message
    };

    struct SchemaField {
        std::string name;
        std::string type;
        std::vector<ValidationRule> rules;
    };

    struct Schema {
        std::string name;
        std::vector<SchemaField> fields;
        bool strictMode{false};  // if true, rejects unknown properties

        Schema(const std::string& schemaName) : name(schemaName) {}

        bool Validate(const Napi::Value& value, std::vector<std::string>& errors) const;
    };

    // Validation result structure
    struct ValidationResult {
        bool valid;
        std::vector<std::string> errors;
        std::vector<std::string> warnings;
    };

    // Performance metrics
    struct Metrics {
        std::atomic<uint64_t> totalValidations{0};
        std::atomic<uint64_t> passedValidations{0};
        std::atomic<uint64_t> failedValidations{0};
        std::atomic<uint64_t> totalSchemas{0};
        std::atomic<uint64_t> totalRules{0};
        std::atomic<uint64_t> totalValidationTimeUs{0};
        std::atomic<uint64_t> totalSchemaCompilationTimeUs{0};  // Total time spent compiling schemas
        std::atomic<uint64_t> cachedValidations{0};
        std::atomic<uint64_t> cacheMisses{0};
        std::atomic<uint64_t> cacheSize{0};
    };

    // Public JS methods
    Napi::Value RegisterSchema(const Napi::CallbackInfo& info);
    Napi::Value Validate(const Napi::CallbackInfo& info);
    Napi::Value GetSchema(const Napi::CallbackInfo& info);
    Napi::Value RemoveSchema(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value ResetMetrics(const Napi::CallbackInfo& info);

    // Internal methods
    bool validateSchema(const Napi::Object& schemaObj);
    ValidationResult validateObject(const Napi::Object& object, const std::shared_ptr<Schema>& schema);
    bool validateField(const Napi::Value& value, const SchemaField& field, std::vector<std::string>& errors);
    bool applyRule(const ValidationRule& rule, const Napi::Value& value, const std::string& fieldName, std::vector<std::string>& errors);
    std::shared_ptr<Schema> getSchemaByName(const std::string& name);
    std::string getValueTypeString(const Napi::Value& value);

    // Result cache methods
    bool checkCache(const std::string& schemaName, const std::string& objectHash, ValidationResult& result);
    void updateCache(const std::string& schemaName, const std::string& objectHash, const ValidationResult& result);
    std::string calculateObjectHash(const Napi::Object& object);

    // Member variables
    std::unordered_map<std::string, std::shared_ptr<Schema>> schemas_;
    std::mutex schemasMutex_;

    // Simple cache for validation results
    struct CacheEntry {
        ValidationResult result;
        std::chrono::time_point<std::chrono::steady_clock> timestamp;
    };
    std::unordered_map<std::string, std::unordered_map<std::string, CacheEntry>> validationCache_;
    std::mutex cacheMutex_;
    size_t maxCacheSize_;
    size_t cacheTtlMs_;

    Metrics metrics_;
};

} // namespace nexurejs

#endif // NEXUREJS_VALIDATION_ENGINE_H
