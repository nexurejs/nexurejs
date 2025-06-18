#include <napi.h>
#include <string>
#include <unordered_map>
#include <atomic>
#include <chrono>
#include <memory>
#include <vector>
#include <iostream>

namespace nexurejs {

// Forward declarations for schema-related structures
struct FieldDefinition;
struct SchemaDefinition;

// Enum for protocol buffer field types
enum class FieldType {
  INT32 = 0,
  INT64 = 1,
  UINT32 = 2,
  UINT64 = 3,
  SINT32 = 4,
  SINT64 = 5,
  BOOL = 6,
  ENUM = 7,
  FIXED32 = 8,
  FIXED64 = 9,
  SFIXED32 = 10,
  SFIXED64 = 11,
  FLOAT = 12,
  DOUBLE = 13,
  STRING = 14,
  BYTES = 15,
  MESSAGE = 16,
  REPEATED = 17,
  MAP = 18
};

// Struct to hold field metadata
struct FieldDefinition {
  std::string name;
  FieldType type;
  uint32_t id;
  bool isRepeated;
  bool isRequired;
  std::string typeRef;  // For MESSAGE, ENUM, or MAP types, reference to the defined type

  // For MAP type
  FieldType keyType;
  FieldType valueType;
  std::string valueTypeRef;  // For value types that are MESSAGE or ENUM

  // Default value (stored as string, parsed according to type)
  std::string defaultValue;
};

// Schema definition for a message
struct SchemaDefinition {
  std::string name;
  std::vector<FieldDefinition> fields;
  std::unordered_map<std::string, size_t> fieldsByName;
  std::unordered_map<uint32_t, size_t> fieldsById;

  // Nested messages and enums
  std::unordered_map<std::string, std::shared_ptr<SchemaDefinition>> nestedMessages;
  std::unordered_map<std::string, std::unordered_map<std::string, int32_t>> nestedEnums;
};

class ProtocolBuffers : public Napi::ObjectWrap<ProtocolBuffers> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  ProtocolBuffers(const Napi::CallbackInfo& info);
  ~ProtocolBuffers();

private:
  struct ProtobufMetrics {
    std::atomic<uint64_t> totalSerializationTime{0};
    std::atomic<uint64_t> totalDeserializationTime{0};
    std::atomic<uint64_t> messagesSerialized{0};
    std::atomic<uint64_t> messagesDeserialized{0};
    std::atomic<uint64_t> bytesEncoded{0};
    std::atomic<uint64_t> bytesDecoded{0};
    std::atomic<uint64_t> schemaCompilationCount{0};
    std::atomic<uint64_t> schemaCompilationTime{0};
    std::atomic<uint64_t> validationErrors{0};
    std::atomic<uint64_t> validationTime{0};
  };

  // Methods exposed to JavaScript
  Napi::Value DefineSchema(const Napi::CallbackInfo& info);
  Napi::Value RegisterEnum(const Napi::CallbackInfo& info);
  Napi::Value Serialize(const Napi::CallbackInfo& info);
  Napi::Value Deserialize(const Napi::CallbackInfo& info);
  Napi::Value Validate(const Napi::CallbackInfo& info);
  Napi::Value GetSchemas(const Napi::CallbackInfo& info);
  Napi::Value RemoveSchema(const Napi::CallbackInfo& info);
  Napi::Value ResetMetrics(const Napi::CallbackInfo& info);
  Napi::Value GetMetrics(const Napi::CallbackInfo& info);

  // Internal methods
  std::shared_ptr<SchemaDefinition> ParseSchemaDefinition(const Napi::Object& schemaObject);
  FieldDefinition ParseFieldDefinition(const Napi::Object& fieldObject);
  FieldType GetFieldTypeFromString(const std::string& typeStr);

  // Serialization/deserialization helpers
  std::vector<uint8_t> SerializeMessage(const Napi::Object& message,
                                         const std::shared_ptr<SchemaDefinition>& schema);
  Napi::Object DeserializeMessage(const std::vector<uint8_t>& data,
                                   const std::shared_ptr<SchemaDefinition>& schema,
                                   Napi::Env env);

  // Field encoder/decoder functions
  void EncodeVarInt(std::vector<uint8_t>& out, uint64_t value);
  uint64_t DecodeVarInt(const uint8_t* data, size_t& offset, size_t maxLength);
  void EncodeField(std::vector<uint8_t>& out, const FieldDefinition& field,
                   const Napi::Value& value, const std::shared_ptr<SchemaDefinition>& schema);
  Napi::Value DecodeField(const uint8_t* data, size_t& offset, size_t maxLength,
                          const FieldDefinition& field, Napi::Env env,
                          const std::shared_ptr<SchemaDefinition>& schema);

  // Field type-specific encoders/decoders
  void EncodeInt32(std::vector<uint8_t>& out, int32_t value);
  void EncodeInt64(std::vector<uint8_t>& out, int64_t value);
  void EncodeUInt32(std::vector<uint8_t>& out, uint32_t value);
  void EncodeUInt64(std::vector<uint8_t>& out, uint64_t value);
  void EncodeSInt32(std::vector<uint8_t>& out, int32_t value);
  void EncodeSInt64(std::vector<uint8_t>& out, int64_t value);
  void EncodeBool(std::vector<uint8_t>& out, bool value);
  void EncodeFixed32(std::vector<uint8_t>& out, uint32_t value);
  void EncodeFixed64(std::vector<uint8_t>& out, uint64_t value);
  void EncodeSFixed32(std::vector<uint8_t>& out, int32_t value);
  void EncodeSFixed64(std::vector<uint8_t>& out, int64_t value);
  void EncodeFloat(std::vector<uint8_t>& out, float value);
  void EncodeDouble(std::vector<uint8_t>& out, double value);
  void EncodeString(std::vector<uint8_t>& out, const std::string& value);
  void EncodeBytes(std::vector<uint8_t>& out, const void* data, size_t length);

  int32_t DecodeInt32(const uint8_t* data, size_t& offset, size_t maxLength);
  int64_t DecodeInt64(const uint8_t* data, size_t& offset, size_t maxLength);
  uint32_t DecodeUInt32(const uint8_t* data, size_t& offset, size_t maxLength);
  uint64_t DecodeUInt64(const uint8_t* data, size_t& offset, size_t maxLength);
  int32_t DecodeSInt32(const uint8_t* data, size_t& offset, size_t maxLength);
  int64_t DecodeSInt64(const uint8_t* data, size_t& offset, size_t maxLength);
  bool DecodeBool(const uint8_t* data, size_t& offset, size_t maxLength);
  uint32_t DecodeFixed32(const uint8_t* data, size_t& offset, size_t maxLength);
  uint64_t DecodeFixed64(const uint8_t* data, size_t& offset, size_t maxLength);
  int32_t DecodeSFixed32(const uint8_t* data, size_t& offset, size_t maxLength);
  int64_t DecodeSFixed64(const uint8_t* data, size_t& offset, size_t maxLength);
  float DecodeFloat(const uint8_t* data, size_t& offset, size_t maxLength);
  double DecodeDouble(const uint8_t* data, size_t& offset, size_t maxLength);
  std::string DecodeString(const uint8_t* data, size_t& offset, size_t maxLength);
  std::vector<uint8_t> DecodeBytes(const uint8_t* data, size_t& offset, size_t maxLength);

  // Validation
  bool ValidateMessage(const Napi::Object& message, const std::shared_ptr<SchemaDefinition>& schema);
  bool ValidateField(const Napi::Value& value, const FieldDefinition& field,
                     const std::shared_ptr<SchemaDefinition>& schema);

  // Member variables
  std::unordered_map<std::string, std::shared_ptr<SchemaDefinition>> schemas;
  std::unordered_map<std::string, std::unordered_map<std::string, int32_t>> enums;
  ProtobufMetrics metrics;
};

Napi::FunctionReference ProtocolBuffers::constructor;

Napi::Object ProtocolBuffers::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "ProtocolBuffers", {
    InstanceMethod("defineSchema", &ProtocolBuffers::DefineSchema),
    InstanceMethod("registerEnum", &ProtocolBuffers::RegisterEnum),
    InstanceMethod("serialize", &ProtocolBuffers::Serialize),
    InstanceMethod("deserialize", &ProtocolBuffers::Deserialize),
    InstanceMethod("validate", &ProtocolBuffers::Validate),
    InstanceMethod("getSchemas", &ProtocolBuffers::GetSchemas),
    InstanceMethod("removeSchema", &ProtocolBuffers::RemoveSchema),
    InstanceMethod("resetMetrics", &ProtocolBuffers::ResetMetrics),
    InstanceMethod("getMetrics", &ProtocolBuffers::GetMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("ProtocolBuffers", func);
  return exports;
}

ProtocolBuffers::ProtocolBuffers(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ProtocolBuffers>(info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);
}

ProtocolBuffers::~ProtocolBuffers() {
  // Clean up resources
  schemas.clear();
  enums.clear();
}

Napi::Value ProtocolBuffers::DefineSchema(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Schema definition object expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  Napi::Object schemaObj = info[0].As<Napi::Object>();

  try {
    auto schema = ParseSchemaDefinition(schemaObj);

    // Store the schema
    schemas[schema->name] = schema;

    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    metrics.schemaCompilationCount++;
    metrics.schemaCompilationTime += duration;

    return Napi::Boolean::New(env, true);
  }
  catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value ProtocolBuffers::RegisterEnum(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected enum name (string) and values object").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string enumName = info[0].As<Napi::String>().Utf8Value();
  Napi::Object enumValues = info[1].As<Napi::Object>();

  // Parse enum values
  std::unordered_map<std::string, int32_t> values;
  Napi::Array keys = enumValues.GetPropertyNames();

  for (uint32_t i = 0; i < keys.Length(); i++) {
    Napi::Value key = keys.Get(i);
    std::string keyStr = key.As<Napi::String>().Utf8Value();
    int32_t value = enumValues.Get(key).As<Napi::Number>().Int32Value();
    values[keyStr] = value;
  }

  // Store the enum
  enums[enumName] = values;

  return Napi::Boolean::New(env, true);
}

Napi::Value ProtocolBuffers::Serialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected message object and schema name").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object message = info[0].As<Napi::Object>();
  std::string schemaName = info[1].As<Napi::String>().Utf8Value();

  // Find the schema
  auto schemaIt = schemas.find(schemaName);
  if (schemaIt == schemas.end()) {
    Napi::Error::New(env, "Schema not found: " + schemaName).ThrowAsJavaScriptException();
    return env.Null();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Optionally validate the message first
    bool shouldValidate = info.Length() > 2 && info[2].IsBoolean() && info[2].As<Napi::Boolean>().Value();

    if (shouldValidate) {
      auto validationStart = std::chrono::high_resolution_clock::now();
      bool isValid = ValidateMessage(message, schemaIt->second);
      auto validationEnd = std::chrono::high_resolution_clock::now();
      auto validationDuration = std::chrono::duration_cast<std::chrono::microseconds>(
        validationEnd - validationStart).count();

      metrics.validationTime += validationDuration;

      if (!isValid) {
        metrics.validationErrors++;
        Napi::Error::New(env, "Message validation failed").ThrowAsJavaScriptException();
        return env.Null();
      }
    }

    // Serialize the message
    std::vector<uint8_t> serialized = SerializeMessage(message, schemaIt->second);

    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    metrics.totalSerializationTime += duration;
    metrics.messagesSerialized++;
    metrics.bytesEncoded += serialized.size();

    // Return the serialized buffer
    return Napi::Buffer<uint8_t>::Copy(env, serialized.data(), serialized.size());
  }
  catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value ProtocolBuffers::Deserialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected buffer and schema name").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  std::string schemaName = info[1].As<Napi::String>().Utf8Value();

  // Find the schema
  auto schemaIt = schemas.find(schemaName);
  if (schemaIt == schemas.end()) {
    Napi::Error::New(env, "Schema not found: " + schemaName).ThrowAsJavaScriptException();
    return env.Null();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  try {
    // Create a vector view of the buffer data
    std::vector<uint8_t> data(buffer.Data(), buffer.Data() + buffer.Length());

    // Deserialize the message
    Napi::Object result = DeserializeMessage(data, schemaIt->second, env);

    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

    metrics.totalDeserializationTime += duration;
    metrics.messagesDeserialized++;
    metrics.bytesDecoded += buffer.Length();

    return result;
  }
  catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Value ProtocolBuffers::Validate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected message object and schema name").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object message = info[0].As<Napi::Object>();
  std::string schemaName = info[1].As<Napi::String>().Utf8Value();

  // Find the schema
  auto schemaIt = schemas.find(schemaName);
  if (schemaIt == schemas.end()) {
    Napi::Error::New(env, "Schema not found: " + schemaName).ThrowAsJavaScriptException();
    return env.Null();
  }

  auto startTime = std::chrono::high_resolution_clock::now();

  bool isValid = ValidateMessage(message, schemaIt->second);

  auto endTime = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();

  metrics.validationTime += duration;

  if (!isValid) {
    metrics.validationErrors++;
  }

  return Napi::Boolean::New(env, isValid);
}

Napi::Value ProtocolBuffers::GetSchemas(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  Napi::Array result = Napi::Array::New(env, schemas.size());

  uint32_t index = 0;
  for (const auto& pair : schemas) {
    result.Set(index++, Napi::String::New(env, pair.first));
  }

  return result;
}

Napi::Value ProtocolBuffers::RemoveSchema(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected schema name (string)").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string schemaName = info[0].As<Napi::String>().Utf8Value();

  auto it = schemas.find(schemaName);
  if (it != schemas.end()) {
    schemas.erase(it);
    return Napi::Boolean::New(env, true);
  }

  return Napi::Boolean::New(env, false);
}

Napi::Value ProtocolBuffers::ResetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  metrics.totalSerializationTime = 0;
  metrics.totalDeserializationTime = 0;
  metrics.messagesSerialized = 0;
  metrics.messagesDeserialized = 0;
  metrics.bytesEncoded = 0;
  metrics.bytesDecoded = 0;
  metrics.schemaCompilationCount = 0;
  metrics.schemaCompilationTime = 0;
  metrics.validationErrors = 0;
  metrics.validationTime = 0;

  return env.Undefined();
}

Napi::Value ProtocolBuffers::GetMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  Napi::Object result = Napi::Object::New(env);
  result.Set("totalSerializationTime", Napi::Number::New(env, metrics.totalSerializationTime));
  result.Set("totalDeserializationTime", Napi::Number::New(env, metrics.totalDeserializationTime));
  result.Set("messagesSerialized", Napi::Number::New(env, metrics.messagesSerialized));
  result.Set("messagesDeserialized", Napi::Number::New(env, metrics.messagesDeserialized));
  result.Set("bytesEncoded", Napi::Number::New(env, metrics.bytesEncoded));
  result.Set("bytesDecoded", Napi::Number::New(env, metrics.bytesDecoded));
  result.Set("schemaCompilationCount", Napi::Number::New(env, metrics.schemaCompilationCount));
  result.Set("schemaCompilationTime", Napi::Number::New(env, metrics.schemaCompilationTime));
  result.Set("validationErrors", Napi::Number::New(env, metrics.validationErrors));
  result.Set("validationTime", Napi::Number::New(env, metrics.validationTime));

  // Calculate average time per message, if available
  if (metrics.messagesSerialized > 0) {
    double avgSerializationTime = static_cast<double>(metrics.totalSerializationTime) /
                                 static_cast<double>(metrics.messagesSerialized);
    result.Set("avgSerializationTimeUs", Napi::Number::New(env, avgSerializationTime));
  }

  if (metrics.messagesDeserialized > 0) {
    double avgDeserializationTime = static_cast<double>(metrics.totalDeserializationTime) /
                                   static_cast<double>(metrics.messagesDeserialized);
    result.Set("avgDeserializationTimeUs", Napi::Number::New(env, avgDeserializationTime));
  }

  return result;
}

// This would contain the implementation of the internal methods mentioned above.
// For brevity, we're not showing the full implementation of every serialization/deserialization method,
// as they would add significant length to the example.
// In a real implementation, these would include the full encoding/decoding logic for each field type.

std::shared_ptr<SchemaDefinition> ProtocolBuffers::ParseSchemaDefinition(const Napi::Object& schemaObject) {
  // Implementation would parse the schema definition from the JavaScript object
  // and create the corresponding C++ structure

  // This is a simplified implementation for demonstration purposes
  auto schema = std::make_shared<SchemaDefinition>();

  if (!schemaObject.Has("name") || !schemaObject.Get("name").IsString()) {
    throw std::runtime_error("Schema must have a name property");
  }

  schema->name = schemaObject.Get("name").As<Napi::String>().Utf8Value();

  if (schemaObject.Has("fields") && schemaObject.Get("fields").IsArray()) {
    Napi::Array fields = schemaObject.Get("fields").As<Napi::Array>();

    for (uint32_t i = 0; i < fields.Length(); i++) {
      Napi::Value fieldValue = fields.Get(i);

      if (fieldValue.IsObject()) {
        FieldDefinition field = ParseFieldDefinition(fieldValue.As<Napi::Object>());

        // Store field in the schema
        size_t fieldIndex = schema->fields.size();
        schema->fields.push_back(field);
        schema->fieldsByName[field.name] = fieldIndex;
        schema->fieldsById[field.id] = fieldIndex;
      }
    }
  }

  // Parse any nested messages
  if (schemaObject.Has("messages") && schemaObject.Get("messages").IsObject()) {
    Napi::Object nestedMessages = schemaObject.Get("messages").As<Napi::Object>();
    Napi::Array keys = nestedMessages.GetPropertyNames();

    for (uint32_t i = 0; i < keys.Length(); i++) {
      Napi::Value key = keys.Get(i);
      std::string messageName = key.As<Napi::String>().Utf8Value();
      Napi::Value messageValue = nestedMessages.Get(key);

      if (messageValue.IsObject()) {
        Napi::Object messageObj = messageValue.As<Napi::Object>();
        // Recursively parse nested message
        auto nestedSchema = ParseSchemaDefinition(messageObj);
        schema->nestedMessages[messageName] = nestedSchema;
      }
    }
  }

  // Parse any nested enums
  if (schemaObject.Has("enums") && schemaObject.Get("enums").IsObject()) {
    Napi::Object nestedEnums = schemaObject.Get("enums").As<Napi::Object>();
    Napi::Array keys = nestedEnums.GetPropertyNames();

    for (uint32_t i = 0; i < keys.Length(); i++) {
      Napi::Value key = keys.Get(i);
      std::string enumName = key.As<Napi::String>().Utf8Value();
      Napi::Value enumValue = nestedEnums.Get(key);

      if (enumValue.IsObject()) {
        Napi::Object enumObj = enumValue.As<Napi::Object>();
        // Parse enum values
        std::unordered_map<std::string, int32_t> enumValues;
        Napi::Array enumKeys = enumObj.GetPropertyNames();

        for (uint32_t j = 0; j < enumKeys.Length(); j++) {
          Napi::Value enumKey = enumKeys.Get(j);
          std::string enumKeyStr = enumKey.As<Napi::String>().Utf8Value();
          int32_t enumVal = enumObj.Get(enumKey).As<Napi::Number>().Int32Value();
          enumValues[enumKeyStr] = enumVal;
        }

        schema->nestedEnums[enumName] = enumValues;
      }
    }
  }

  return schema;
}

FieldDefinition ProtocolBuffers::ParseFieldDefinition(const Napi::Object& fieldObject) {
  // Implementation would parse the field definition from the JavaScript object
  // and create the corresponding C++ structure

  // This is a simplified implementation for demonstration purposes
  FieldDefinition field;

  if (!fieldObject.Has("name") || !fieldObject.Get("name").IsString()) {
    throw std::runtime_error("Field must have a name property");
  }
  field.name = fieldObject.Get("name").As<Napi::String>().Utf8Value();

  if (!fieldObject.Has("id") || !fieldObject.Get("id").IsNumber()) {
    throw std::runtime_error("Field must have an id property");
  }
  field.id = fieldObject.Get("id").As<Napi::Number>().Uint32Value();

  if (!fieldObject.Has("type") || !fieldObject.Get("type").IsString()) {
    throw std::runtime_error("Field must have a type property");
  }
  std::string typeStr = fieldObject.Get("type").As<Napi::String>().Utf8Value();
  field.type = GetFieldTypeFromString(typeStr);

  // Optional properties
  field.isRepeated = fieldObject.Has("repeated") &&
                     fieldObject.Get("repeated").IsBoolean() &&
                     fieldObject.Get("repeated").As<Napi::Boolean>().Value();

  field.isRequired = fieldObject.Has("required") &&
                     fieldObject.Get("required").IsBoolean() &&
                     fieldObject.Get("required").As<Napi::Boolean>().Value();

  if (fieldObject.Has("typeRef") && fieldObject.Get("typeRef").IsString()) {
    field.typeRef = fieldObject.Get("typeRef").As<Napi::String>().Utf8Value();
  }

  if (fieldObject.Has("defaultValue")) {
    Napi::Value defaultValue = fieldObject.Get("defaultValue");

    if (defaultValue.IsString()) {
      field.defaultValue = defaultValue.As<Napi::String>().Utf8Value();
    } else if (defaultValue.IsNumber()) {
      field.defaultValue = std::to_string(defaultValue.As<Napi::Number>().DoubleValue());
    } else if (defaultValue.IsBoolean()) {
      field.defaultValue = defaultValue.As<Napi::Boolean>().Value() ? "true" : "false";
    }
  }

  // Handle MAP type
  if (field.type == FieldType::MAP) {
    if (!fieldObject.Has("keyType") || !fieldObject.Get("keyType").IsString()) {
      throw std::runtime_error("MAP field must have a keyType property");
    }
    std::string keyTypeStr = fieldObject.Get("keyType").As<Napi::String>().Utf8Value();
    field.keyType = GetFieldTypeFromString(keyTypeStr);

    if (!fieldObject.Has("valueType") || !fieldObject.Get("valueType").IsString()) {
      throw std::runtime_error("MAP field must have a valueType property");
    }
    std::string valueTypeStr = fieldObject.Get("valueType").As<Napi::String>().Utf8Value();
    field.valueType = GetFieldTypeFromString(valueTypeStr);

    if (fieldObject.Has("valueTypeRef") && fieldObject.Get("valueTypeRef").IsString()) {
      field.valueTypeRef = fieldObject.Get("valueTypeRef").As<Napi::String>().Utf8Value();
    }
  }

  return field;
}

FieldType ProtocolBuffers::GetFieldTypeFromString(const std::string& typeStr) {
  if (typeStr == "int32") return FieldType::INT32;
  if (typeStr == "int64") return FieldType::INT64;
  if (typeStr == "uint32") return FieldType::UINT32;
  if (typeStr == "uint64") return FieldType::UINT64;
  if (typeStr == "sint32") return FieldType::SINT32;
  if (typeStr == "sint64") return FieldType::SINT64;
  if (typeStr == "bool") return FieldType::BOOL;
  if (typeStr == "enum") return FieldType::ENUM;
  if (typeStr == "fixed32") return FieldType::FIXED32;
  if (typeStr == "fixed64") return FieldType::FIXED64;
  if (typeStr == "sfixed32") return FieldType::SFIXED32;
  if (typeStr == "sfixed64") return FieldType::SFIXED64;
  if (typeStr == "float") return FieldType::FLOAT;
  if (typeStr == "double") return FieldType::DOUBLE;
  if (typeStr == "string") return FieldType::STRING;
  if (typeStr == "bytes") return FieldType::BYTES;
  if (typeStr == "message") return FieldType::MESSAGE;
  if (typeStr == "repeated") return FieldType::REPEATED;
  if (typeStr == "map") return FieldType::MAP;

  throw std::runtime_error("Unknown field type: " + typeStr);
}

// These are stub implementations. In a real implementation, these would be fully functional.
std::vector<uint8_t> ProtocolBuffers::SerializeMessage(const Napi::Object& message,
                                                      const std::shared_ptr<SchemaDefinition>& schema) {
  // Stub implementation
  std::vector<uint8_t> result;
  // In a real implementation, this would iterate through the schema fields
  // and encode each field from the message object

  return result;
}

Napi::Object ProtocolBuffers::DeserializeMessage(const std::vector<uint8_t>& data,
                                                const std::shared_ptr<SchemaDefinition>& schema,
                                                Napi::Env env) {
  // Stub implementation
  Napi::Object result = Napi::Object::New(env);
  // In a real implementation, this would decode the binary data according to the schema

  return result;
}

bool ProtocolBuffers::ValidateMessage(const Napi::Object& message,
                                     const std::shared_ptr<SchemaDefinition>& schema) {
  // Stub implementation
  // In a real implementation, this would validate that the message conforms to the schema

  return true;
}

} // namespace nexurejs
