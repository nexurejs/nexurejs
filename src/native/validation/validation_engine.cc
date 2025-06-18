#include <napi.h>
#include <string>
#include <unordered_map>
#include <atomic>
#include <chrono>
#include <mutex>
#include <memory>
#include <vector>
#include <functional>
#include <regex>
#include "validation_engine.h"

namespace nexurejs {

// Forward declarations for helper classes
class ValidationRule;

// Enum for validation rule types
enum class RuleType {
  TYPE = 0,
  REQUIRED = 1,
  MIN_LENGTH = 2,
  MAX_LENGTH = 3,
  PATTERN = 4,
  MIN_VALUE = 5,
  MAX_VALUE = 6,
  EMAIL = 7,
  URL = 8,
  UUID = 9,
  ENUM = 10,
  ARRAY_MIN = 11,
  ARRAY_MAX = 12,
  ARRAY_ITEMS = 13,
  OBJECT_PROPS = 14,
  CUSTOM = 15,
  ONEOF = 16,
  ALLOF = 17,
  ANYOF = 18,
  NOT = 19
};

// Enum for data types
enum class DataType {
  STRING = 0,
  NUMBER = 1,
  INTEGER = 2,
  BOOLEAN = 3,
  ARRAY = 4,
  OBJECT = 5,
  NULL_TYPE = 6,
  ANY = 7
};

// Base class for validation rules
class ValidationRule {
public:
  ValidationRule(RuleType type) : type(type) {}
  virtual ~ValidationRule() = default;

  virtual bool Validate(const Napi::Value& value, std::string& errorMessage) const = 0;

  RuleType GetType() const { return type; }

protected:
  RuleType type;
};

// Type validation rule
class TypeRule : public ValidationRule {
public:
  TypeRule(DataType dataType) : ValidationRule(RuleType::TYPE), dataType(dataType) {}

  bool Validate(const Napi::Value& value, std::string& errorMessage) const override {
    switch (dataType) {
      case DataType::STRING:
        if (!value.IsString()) {
          errorMessage = "Expected string";
          return false;
        }
        break;
      case DataType::NUMBER:
        if (!value.IsNumber()) {
          errorMessage = "Expected number";
          return false;
        }
        break;
      case DataType::INTEGER:
        if (!value.IsNumber() ||
            std::floor(value.As<Napi::Number>().DoubleValue()) != value.As<Napi::Number>().DoubleValue()) {
          errorMessage = "Expected integer";
          return false;
        }
        break;
      case DataType::BOOLEAN:
        if (!value.IsBoolean()) {
          errorMessage = "Expected boolean";
          return false;
        }
        break;
      case DataType::ARRAY:
        if (!value.IsArray()) {
          errorMessage = "Expected array";
          return false;
        }
        break;
      case DataType::OBJECT:
        if (!value.IsObject() || value.IsArray() || value.IsFunction()) {
          errorMessage = "Expected object";
          return false;
        }
        break;
      case DataType::NULL_TYPE:
        if (!value.IsNull()) {
          errorMessage = "Expected null";
          return false;
        }
        break;
      case DataType::ANY:
        // Any type is always valid
        break;
    }
    return true;
  }

private:
  DataType dataType;
};

// Required validation rule
class RequiredRule : public ValidationRule {
public:
  RequiredRule() : ValidationRule(RuleType::REQUIRED) {}

  bool Validate(const Napi::Value& value, std::string& errorMessage) const override {
    if (value.IsUndefined() || value.IsNull()) {
      errorMessage = "Value is required";
      return false;
    }
    return true;
  }
};

// MinLength validation rule
class MinLengthRule : public ValidationRule {
public:
  MinLengthRule(size_t minLength) : ValidationRule(RuleType::MIN_LENGTH), minLength(minLength) {}

  bool Validate(const Napi::Value& value, std::string& errorMessage) const override {
    if (value.IsString()) {
      std::string str = value.As<Napi::String>().Utf8Value();
      if (str.length() < minLength) {
        errorMessage = "String length is less than " + std::to_string(minLength);
        return false;
      }
    } else if (value.IsArray()) {
      Napi::Array array = value.As<Napi::Array>();
      if (array.Length() < minLength) {
        errorMessage = "Array length is less than " + std::to_string(minLength);
        return false;
      }
    } else {
      errorMessage = "MinLength rule requires string or array";
      return false;
    }
    return true;
  }

private:
  size_t minLength;
};

// MaxLength validation rule
class MaxLengthRule : public ValidationRule {
public:
  MaxLengthRule(size_t maxLength) : ValidationRule(RuleType::MAX_LENGTH), maxLength(maxLength) {}

  bool Validate(const Napi::Value& value, std::string& errorMessage) const override {
    if (value.IsString()) {
      std::string str = value.As<Napi::String>().Utf8Value();
      if (str.length() > maxLength) {
        errorMessage = "String length is greater than " + std::to_string(maxLength);
        return false;
      }
    } else if (value.IsArray()) {
      Napi::Array array = value.As<Napi::Array>();
      if (array.Length() > maxLength) {
        errorMessage = "Array length is greater than " + std::to_string(maxLength);
        return false;
      }
    } else {
      errorMessage = "MaxLength rule requires string or array";
      return false;
    }
    return true;
  }

private:
  size_t maxLength;
};

// Pattern validation rule
class PatternRule : public ValidationRule {
public:
  PatternRule(const std::string& pattern)
    : ValidationRule(RuleType::PATTERN), pattern(pattern), regex(pattern) {}

  bool Validate(const Napi::Value& value, std::string& errorMessage) const override {
    if (!value.IsString()) {
      errorMessage = "Pattern rule requires string";
      return false;
    }

    std::string str = value.As<Napi::String>().Utf8Value();
    if (!std::regex_match(str, regex)) {
      errorMessage = "String does not match pattern: " + pattern;
      return false;
    }
    return true;
  }

private:
  std::string pattern;
  std::regex regex;
};

// Initialize the static constructor from the header file
Napi::FunctionReference ValidationEngine::constructor;

Napi::Object ValidationEngine::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "ValidationEngine", {
    InstanceMethod("registerSchema", &ValidationEngine::RegisterSchema),
    InstanceMethod("validate", &ValidationEngine::Validate),
    InstanceMethod("getSchema", &ValidationEngine::GetSchema),
    InstanceMethod("removeSchema", &ValidationEngine::RemoveSchema),
    InstanceMethod("resetMetrics", &ValidationEngine::ResetMetrics),
    InstanceMethod("getMetrics", &ValidationEngine::GetMetrics),
    StaticMethod("getInstance", &ValidationEngine::GetInstance),
    StaticMethod("resetMetrics", &ValidationEngine::ResetMetricsStatic)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("ValidationEngine", func);
  return exports;
}

// Add static getInstance method implementation
Napi::Value ValidationEngine::GetInstance(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  static Napi::ObjectReference instance;
  if (instance.IsEmpty()) {
    // Create default ValidationEngine instance if not already created
    Napi::Object obj = constructor.New({});
    instance = Napi::Persistent(obj);
  }

  return instance.Value();
}

// Add static resetMetrics method implementation
Napi::Value ValidationEngine::ResetMetricsStatic(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Get the singleton instance and reset its metrics
  Napi::Value instance = GetInstance(info);
  if (instance.IsObject()) {
    Napi::Object obj = instance.As<Napi::Object>();
    ValidationEngine* engine = Napi::ObjectWrap<ValidationEngine>::Unwrap(obj);
    if (engine) {
      engine->ResetMetrics(info);
    }
  }

  return env.Undefined();
}

ValidationEngine::ValidationEngine(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ValidationEngine>(info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Initialize default values
  maxCacheSize_ = 1000;  // Default max cache size
  cacheTtlMs_ = 60000;   // Default cache TTL (1 minute)
}

ValidationEngine::~ValidationEngine() {
  // Clean up compiled schemas
  std::lock_guard<std::mutex> lock(schemasMutex_);
  schemas_.clear();
}

Napi::Value ValidationEngine::RegisterSchema(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected schema name (string) and schema object").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string schemaName = info[0].As<Napi::String>().Utf8Value();
  Napi::Object schemaObj = info[1].As<Napi::Object>();

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Create a new schema
    auto schema = std::make_shared<Schema>(schemaName);

    // Set strictMode if provided
    if (schemaObj.Has("strictMode") && schemaObj.Get("strictMode").IsBoolean()) {
      schema->strictMode = schemaObj.Get("strictMode").As<Napi::Boolean>().Value();
    }

    // Process fields
    if (schemaObj.Has("fields") && schemaObj.Get("fields").IsArray()) {
      Napi::Array fieldsArray = schemaObj.Get("fields").As<Napi::Array>();

      for (uint32_t i = 0; i < fieldsArray.Length(); i++) {
        if (!fieldsArray.Get(i).IsObject()) continue;

        Napi::Object fieldObj = fieldsArray.Get(i).As<Napi::Object>();

        if (!fieldObj.Has("name") || !fieldObj.Get("name").IsString()) continue;

        SchemaField field;
        field.name = fieldObj.Get("name").As<Napi::String>().Utf8Value();

        if (fieldObj.Has("type") && fieldObj.Get("type").IsString()) {
          field.type = fieldObj.Get("type").As<Napi::String>().Utf8Value();
        }

        // Process validation rules
        if (fieldObj.Has("rules") && fieldObj.Get("rules").IsArray()) {
          Napi::Array rulesArray = fieldObj.Get("rules").As<Napi::Array>();

          for (uint32_t j = 0; j < rulesArray.Length(); j++) {
            if (!rulesArray.Get(j).IsObject()) continue;

            Napi::Object ruleObj = rulesArray.Get(j).As<Napi::Object>();

            if (!ruleObj.Has("type") || !ruleObj.Get("type").IsString()) continue;

            ValidationRule rule;
            rule.type = ruleObj.Get("type").As<Napi::String>().Utf8Value();

            if (ruleObj.Has("value") && ruleObj.Get("value").IsString()) {
              rule.value = ruleObj.Get("value").As<Napi::String>().Utf8Value();
            }

            if (ruleObj.Has("message") && ruleObj.Get("message").IsString()) {
              rule.message = ruleObj.Get("message").As<Napi::String>().Utf8Value();
            }

            field.rules.push_back(rule);
          }
        }

        schema->fields.push_back(field);
      }
    }

    // Store schema
    {
      std::lock_guard<std::mutex> lock(schemasMutex_);
      schemas_[schemaName] = schema;
      metrics_.totalSchemas = schemas_.size();
      metrics_.totalRules += schema->fields.size(); // Approximate count
    }

    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();
    metrics_.totalSchemaCompilationTimeUs += duration;

    return Napi::Boolean::New(env, true);
  }
  catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value ValidationEngine::Validate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected schema name (string) and data object").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string schemaName = info[0].As<Napi::String>().Utf8Value();
  Napi::Value data = info[1];

  // Find the schema
  std::shared_ptr<Schema> schema;
  {
    std::lock_guard<std::mutex> lock(schemasMutex_);
    auto it = schemas_.find(schemaName);
    if (it == schemas_.end()) {
      metrics_.cacheMisses++;
      Napi::Error::New(env, "Schema not found: " + schemaName).ThrowAsJavaScriptException();
      return env.Null();
    }
    schema = it->second;
    metrics_.cachedValidations++;
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  // Validate the data using the Schema class's Validate method
  std::vector<std::string> errors;
  bool isValid = schema->Validate(data, errors);

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  metrics_.totalValidations++;
  metrics_.totalValidationTimeUs += duration;

  if (isValid) {
    metrics_.passedValidations++;
  } else {
    metrics_.failedValidations++;
  }

  // Create result object
  Napi::Object result = Napi::Object::New(env);
  result.Set("valid", Napi::Boolean::New(env, isValid));

  // Create errors array
  Napi::Array errorsArray = Napi::Array::New(env, errors.size());
  for (size_t i = 0; i < errors.size(); i++) {
    errorsArray.Set(i, Napi::String::New(env, errors[i]));
  }
  result.Set("errors", errorsArray);

  return result;
}

Napi::Value ValidationEngine::GetSchema(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsString()) {
    // Change the implementation to get a single schema by name instead of listing all schemas
    Napi::TypeError::New(env, "Expected schema name (string)").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string schemaName = info[0].As<Napi::String>().Utf8Value();

  std::lock_guard<std::mutex> lock(schemasMutex_);

  auto it = schemas_.find(schemaName);
  if (it == schemas_.end()) {
    return env.Null(); // Schema not found
  }

  // Return a basic object representing the schema
  Napi::Object result = Napi::Object::New(env);
  result.Set("name", Napi::String::New(env, schemaName));

  return result;
}

Napi::Value ValidationEngine::RemoveSchema(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected schema name (string)").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string schemaName = info[0].As<Napi::String>().Utf8Value();

  bool removed = false;
  {
    std::lock_guard<std::mutex> lock(schemasMutex_);
    auto it = schemas_.find(schemaName);
    if (it != schemas_.end()) {
      schemas_.erase(it);
      removed = true;
      metrics_.totalSchemas = schemas_.size();
    }
  }

  return Napi::Boolean::New(env, removed);
}

Napi::Value ValidationEngine::ResetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  metrics_.totalValidations = 0;
  metrics_.passedValidations = 0;
  metrics_.failedValidations = 0;
  // Don't reset totalSchemas as it represents current state
  metrics_.totalRules = 0;
  metrics_.totalValidationTimeUs = 0;
  metrics_.totalSchemaCompilationTimeUs = 0;
  metrics_.cachedValidations = 0;
  metrics_.cacheMisses = 0;
  metrics_.cacheSize = 0;

  return env.Undefined();
}

Napi::Value ValidationEngine::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  Napi::Object result = Napi::Object::New(env);
  result.Set("totalValidations", Napi::Number::New(env, metrics_.totalValidations));
  result.Set("passedValidations", Napi::Number::New(env, metrics_.passedValidations));
  result.Set("failedValidations", Napi::Number::New(env, metrics_.failedValidations));
  result.Set("totalSchemas", Napi::Number::New(env, metrics_.totalSchemas));
  result.Set("totalRules", Napi::Number::New(env, metrics_.totalRules));
  result.Set("totalValidationTimeUs", Napi::Number::New(env, metrics_.totalValidationTimeUs));
  result.Set("totalSchemaCompilationTimeUs", Napi::Number::New(env, metrics_.totalSchemaCompilationTimeUs));
  result.Set("cachedValidations", Napi::Number::New(env, metrics_.cachedValidations));
  result.Set("cacheMisses", Napi::Number::New(env, metrics_.cacheMisses));
  result.Set("cacheSize", Napi::Number::New(env, metrics_.cacheSize));

  // Calculate average times, if available
  if (metrics_.totalValidations > 0) {
    double avgValidationTime = static_cast<double>(metrics_.totalValidationTimeUs) /
                              static_cast<double>(metrics_.totalValidations);
    result.Set("avgValidationTimeUs", Napi::Number::New(env, avgValidationTime));

    double validRatio = static_cast<double>(metrics_.passedValidations) /
                       static_cast<double>(metrics_.totalValidations);
    result.Set("validRatio", Napi::Number::New(env, validRatio));
  }

  if (metrics_.cachedValidations + metrics_.cacheMisses > 0) {
    double cacheHitRatio = static_cast<double>(metrics_.cachedValidations) /
                          static_cast<double>(metrics_.cachedValidations + metrics_.cacheMisses);
    result.Set("cacheHitRatio", Napi::Number::New(env, cacheHitRatio));
  }

  return result;
}

// Add the Schema::Validate method implementation
bool ValidationEngine::Schema::Validate(const Napi::Value& value, std::vector<std::string>& errors) const {
  if (!value.IsObject()) {
    errors.push_back("Value must be an object");
    return false;
  }

  Napi::Object obj = value.As<Napi::Object>();
  bool isValid = true;

  // Check required fields and validate each field
  for (const auto& field : fields) {
    Napi::Value fieldValue = obj.Has(field.name) ? obj.Get(field.name) : Napi::Value();

    // Check if field exists when needed
    bool fieldRequired = false;
    for (const auto& rule : field.rules) {
      if (rule.type == "required" && rule.value == "true") {
        fieldRequired = true;
        break;
      }
    }

    if (fieldRequired && (fieldValue.IsUndefined() || fieldValue.IsNull())) {
      errors.push_back("Field '" + field.name + "' is required");
      isValid = false;
      continue;
    }

    // Skip validation for undefined optional fields
    if (fieldValue.IsUndefined() || fieldValue.IsNull()) {
      continue;
    }

    // Validate field against all rules
    for (const auto& rule : field.rules) {
      if (rule.type == "type") {
        if (field.type == "string" && !fieldValue.IsString()) {
          errors.push_back(field.name + ": " + (rule.message.empty() ? "Must be a string" : rule.message));
          isValid = false;
        } else if (field.type == "number" && !fieldValue.IsNumber()) {
          errors.push_back(field.name + ": " + (rule.message.empty() ? "Must be a number" : rule.message));
          isValid = false;
        } else if (field.type == "boolean" && !fieldValue.IsBoolean()) {
          errors.push_back(field.name + ": " + (rule.message.empty() ? "Must be a boolean" : rule.message));
          isValid = false;
        } else if (field.type == "object" && (!fieldValue.IsObject() || fieldValue.IsArray())) {
          errors.push_back(field.name + ": " + (rule.message.empty() ? "Must be an object" : rule.message));
          isValid = false;
        } else if (field.type == "array" && !fieldValue.IsArray()) {
          errors.push_back(field.name + ": " + (rule.message.empty() ? "Must be an array" : rule.message));
          isValid = false;
        }
      }
      // Add additional rule validations as needed
    }
  }

  // Strict mode check for unknown properties
  if (strictMode && isValid) {
    Napi::Array propNames = obj.GetPropertyNames();
    for (uint32_t i = 0; i < propNames.Length(); i++) {
      std::string propName = propNames.Get(i).As<Napi::String>().Utf8Value();
      bool knownField = false;

      for (const auto& field : fields) {
        if (field.name == propName) {
          knownField = true;
          break;
        }
      }

      if (!knownField) {
        errors.push_back("Unknown property: " + propName);
        isValid = false;
      }
    }
  }

  return isValid;
}

} // namespace nexurejs
