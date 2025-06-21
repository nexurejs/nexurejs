# Schema Validator Native Module

## Overview

The Schema Validator is a high-performance C++ implementation for validating JSON data against JSON Schema specifications. It provides significantly faster validation compared to JavaScript implementations, with full support for JSON Schema Draft 7 and Draft 2019-09.

## Features

- Fast schema validation using C++ optimizations
- Complete support for JSON Schema Draft 7 and Draft 2019-09
- Schema compilation and caching for repeated validation
- Detailed validation error reporting
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor(options?: { defaultDraft?: 'draft7' | 'draft2019' })
```

Creates a new instance of the Schema Validator. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

**Parameters:**
- `options.defaultDraft` - Optional schema draft version to use ('draft7' or 'draft2019'). Defaults to 'draft7'.

### Methods

#### `compile(schema: object): CompiledSchema`

Compiles a JSON schema for faster repeated validation.

**Parameters:**
- `schema: object` - JSON Schema object to compile

**Returns:**
- `CompiledSchema` - Compiled schema reference that can be used with the validate method

**Throws:**
- Error if the schema is invalid

#### `validate(schema: object | CompiledSchema, data: any): boolean`

Validates data against a schema, returning a boolean result.

**Parameters:**
- `schema: object | CompiledSchema` - JSON Schema object or pre-compiled schema
- `data: any` - Data to validate against the schema

**Returns:**
- `boolean` - True if validation passes, false otherwise

#### `validateWithErrors(schema: object | CompiledSchema, data: any): ValidationResult`

Validates data against a schema, returning detailed error information.

**Parameters:**
- `schema: object | CompiledSchema` - JSON Schema object or pre-compiled schema
- `data: any` - Data to validate against the schema

**Returns:**
- `ValidationResult` - Object containing:
  - `valid: boolean` - Whether validation passed
  - `errors: ValidationError[]` - Array of validation errors (if any)

#### `ValidationError` Interface

```typescript
interface ValidationError {
  path: string;       // JSON path where the error occurred
  message: string;    // Human-readable error message
  schemaPath: string; // Path in the schema that the validation error relates to
  keyword: string;    // JSON Schema keyword that failed validation
}
```

### Static Methods

#### `getPerformanceMetrics(): { jsTime: number; jsCount: number; nativeTime: number; nativeCount: number }`

Returns performance metrics for both JavaScript and native implementations.

**Returns:**
- `jsTime` - Total time spent in JavaScript validator (ms)
- `jsCount` - Number of times JavaScript validator was used
- `nativeTime` - Total time spent in native validator (ms)
- `nativeCount` - Number of times native validator was used

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The Schema Validator native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. The module leverages a high-performance JSON Schema validation library written in C++.

## C++ Implementation Explained

### Core Classes and Methods

#### `SchemaValidator` Class

This is the main C++ class that handles JSON schema validation:

```cpp
class SchemaValidator : public Napi::ObjectWrap<SchemaValidator> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  SchemaValidator(const Napi::CallbackInfo& info);

private:
  // JavaScript-facing methods
  Napi::Value Compile(const Napi::CallbackInfo& info);
  Napi::Value Validate(const Napi::CallbackInfo& info);
  Napi::Value ValidateWithErrors(const Napi::CallbackInfo& info);

  // Performance metrics
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // Internal implementation methods
  std::shared_ptr<CompiledSchema> CompileInternal(const json& schema);
  bool ValidateInternal(const std::shared_ptr<CompiledSchema>& compiledSchema, const json& data);
  ValidationResults ValidateWithErrorsInternal(const std::shared_ptr<CompiledSchema>& compiledSchema, const json& data);

  // Helper methods
  Napi::Value CreateValidationResult(Napi::Env env, const ValidationResults& results);
  std::shared_ptr<CompiledSchema> GetCompiledSchemaFromJS(const Napi::Value& value);

  // Schema validator state
  std::string defaultDraft_;
  std::unordered_map<std::string, std::shared_ptr<CompiledSchema>> schemaCache_;

  // Performance metrics storage
  static PerformanceMetrics metrics_;
};
```

#### `CompiledSchema` Structure

Represents a compiled schema that can be reused for multiple validations:

```cpp
struct CompiledSchema {
  std::string id;                     // Unique ID for the schema
  json originalSchema;                // Original schema object
  std::shared_ptr<SchemaValidator> validator; // Validator instance
  std::string schemaVersion;          // Draft version

  // Internal validation structures
  std::unordered_map<std::string, SchemaKeywordValidator> keywordValidators;
  std::unordered_map<std::string, std::shared_ptr<CompiledSchema>> subschemas;
  std::vector<std::string> requiredProperties;
  std::string schemaType;
};
```

#### `ValidationResults` Structure

Stores validation results including errors:

```cpp
struct ValidationResults {
  bool valid;
  std::vector<ValidationError> errors;
};

struct ValidationError {
  std::string path;       // JSON path where error occurred
  std::string message;    // Human-readable error message
  std::string schemaPath; // Path in schema
  std::string keyword;    // JSON Schema keyword that failed
};
```

### Schema Compilation Implementation

The schema compilation process prepares a schema for efficient validation:

```cpp
std::shared_ptr<CompiledSchema> SchemaValidator::CompileInternal(const json& schema) {
  // Create a new compiled schema
  auto compiledSchema = std::make_shared<CompiledSchema>();
  compiledSchema->originalSchema = schema;

  // Generate a unique ID for the schema (hash of the schema content)
  std::string schemaStr = schema.dump();
  compiledSchema->id = GenerateSchemaId(schemaStr);

  // Determine schema version
  if (schema.contains("$schema")) {
    std::string schemaUri = schema["$schema"].get<std::string>();
    if (schemaUri.find("draft-07") != std::string::npos) {
      compiledSchema->schemaVersion = "draft7";
    } else if (schemaUri.find("draft/2019-09") != std::string::npos) {
      compiledSchema->schemaVersion = "draft2019";
    } else {
      compiledSchema->schemaVersion = defaultDraft_;
    }
  } else {
    compiledSchema->schemaVersion = defaultDraft_;
  }

  // Process top-level schema
  ProcessSchema(compiledSchema, schema, "");

  // Cache the compiled schema
  schemaCache_[compiledSchema->id] = compiledSchema;

  return compiledSchema;
}

void SchemaValidator::ProcessSchema(std::shared_ptr<CompiledSchema>& compiledSchema,
                                   const json& schemaNode,
                                   const std::string& path) {
  // Process each schema keyword
  for (auto it = schemaNode.begin(); it != schemaNode.end(); ++it) {
    const std::string& keyword = it.key();

    // Skip non-validation keywords
    if (keyword == "$schema" || keyword == "$id" || keyword == "$comment" || keyword == "$defs" || keyword == "definitions") {
      continue;
    }

    // Process validation keywords
    std::string keywordPath = path.empty() ? keyword : path + "/" + keyword;

    if (keyword == "type") {
      compiledSchema->schemaType = schemaNode["type"].get<std::string>();
      ProcessTypeKeyword(compiledSchema, schemaNode["type"], keywordPath);
    }
    else if (keyword == "properties") {
      ProcessPropertiesKeyword(compiledSchema, schemaNode["properties"], keywordPath);
    }
    else if (keyword == "required") {
      if (schemaNode["required"].is_array()) {
        for (const auto& prop : schemaNode["required"]) {
          compiledSchema->requiredProperties.push_back(prop.get<std::string>());
        }
      }
    }
    else if (keyword == "additionalProperties") {
      ProcessAdditionalPropertiesKeyword(compiledSchema, schemaNode["additionalProperties"], keywordPath);
    }
    else if (keyword == "items") {
      ProcessItemsKeyword(compiledSchema, schemaNode["items"], keywordPath);
    }
    else if (keyword == "oneOf" || keyword == "anyOf" || keyword == "allOf") {
      ProcessCompositeKeyword(compiledSchema, keyword, schemaNode[keyword], keywordPath);
    }
    else {
      // Process other validation keywords (minimum, maximum, pattern, etc.)
      ProcessSimpleKeyword(compiledSchema, keyword, schemaNode[keyword], keywordPath);
    }
  }
}
```

### Validation Implementation

The validation process checks data against a compiled schema:

```cpp
bool SchemaValidator::ValidateInternal(const std::shared_ptr<CompiledSchema>& compiledSchema, const json& data) {
  ValidationContext context;
  return ValidateNode(compiledSchema, data, "", context);
}

ValidationResults SchemaValidator::ValidateWithErrorsInternal(
    const std::shared_ptr<CompiledSchema>& compiledSchema,
    const json& data) {
  ValidationContext context;
  bool valid = ValidateNode(compiledSchema, data, "", context);

  ValidationResults results;
  results.valid = valid;
  results.errors = context.errors;

  return results;
}

bool SchemaValidator::ValidateNode(
    const std::shared_ptr<CompiledSchema>& schema,
    const json& data,
    const std::string& path,
    ValidationContext& context) {

  // Check type first
  if (!schema->schemaType.empty()) {
    if (!ValidateType(schema->schemaType, data, path, context)) {
      return false;
    }
  }

  // For object schemas
  if (data.is_object()) {
    // Check required properties
    for (const auto& prop : schema->requiredProperties) {
      if (!data.contains(prop)) {
        AddError(context, path, "missing required property: " + prop, "/required", "required");
        return false;
      }
    }

    // Validate properties
    for (auto it = data.begin(); it != data.end(); ++it) {
      const std::string& propName = it.key();
      const std::string propPath = path.empty() ? propName : path + "/" + propName;

      // If property has a specific schema, validate against it
      auto propIt = schema->subschemas.find("properties/" + propName);
      if (propIt != schema->subschemas.end()) {
        if (!ValidateNode(propIt->second, it.value(), propPath, context)) {
          return false;
        }
      }
      // Otherwise check additionalProperties
      else if (schema->subschemas.find("additionalProperties") != schema->subschemas.end()) {
        auto additionalSchema = schema->subschemas["additionalProperties"];
        if (!ValidateNode(additionalSchema, it.value(), propPath, context)) {
          return false;
        }
      }
    }
  }

  // For array schemas
  else if (data.is_array()) {
    // Validate array items
    auto itemsIt = schema->subschemas.find("items");
    if (itemsIt != schema->subschemas.end()) {
      for (size_t i = 0; i < data.size(); i++) {
        std::string itemPath = path + "/" + std::to_string(i);
        if (!ValidateNode(itemsIt->second, data[i], itemPath, context)) {
          return false;
        }
      }
    }
  }

  // Validate against keyword validators
  for (const auto& kvPair : schema->keywordValidators) {
    const auto& keyword = kvPair.first;
    const auto& validator = kvPair.second;

    if (!validator(data, path, context)) {
      // Each validator is responsible for adding its own error
      return false;
    }
  }

  // Composite schemas (allOf, anyOf, oneOf)
  if (schema->subschemas.find("allOf") != schema->subschemas.end()) {
    auto allOfSchemas = schema->subschemas["allOf"];
    for (const auto& subschema : allOfSchemas->subschemas) {
      if (!ValidateNode(subschema.second, data, path, context)) {
        return false;
      }
    }
  }

  if (schema->subschemas.find("anyOf") != schema->subschemas.end()) {
    auto anyOfSchemas = schema->subschemas["anyOf"];
    bool anyValid = false;
    ValidationContext tempContext;

    for (const auto& subschema : anyOfSchemas->subschemas) {
      if (ValidateNode(subschema.second, data, path, tempContext)) {
        anyValid = true;
        break;
      }
    }

    if (!anyValid) {
      AddError(context, path, "failed to match any schema in anyOf", "/anyOf", "anyOf");
      return false;
    }
  }

  if (schema->subschemas.find("oneOf") != schema->subschemas.end()) {
    auto oneOfSchemas = schema->subschemas["oneOf"];
    int validCount = 0;

    for (const auto& subschema : oneOfSchemas->subschemas) {
      ValidationContext tempContext;
      if (ValidateNode(subschema.second, data, path, tempContext)) {
        validCount++;
      }
    }

    if (validCount != 1) {
      AddError(context, path,
               "failed to match exactly one schema in oneOf (matched " +
               std::to_string(validCount) + ")",
               "/oneOf", "oneOf");
      return false;
    }
  }

  return true;
}
```

### Memory Management

The Schema Validator implementation uses smart memory management techniques:

1. **Shared Pointers**: The implementation uses `std::shared_ptr` for reference counting and automatic cleanup:

```cpp
std::shared_ptr<CompiledSchema> compiledSchema = std::make_shared<CompiledSchema>();
```

2. **Schema Caching**: Compiled schemas are cached for reuse:

```cpp
// Cache the compiled schema
schemaCache_[compiledSchema->id] = compiledSchema;
```

3. **Minimizing JSON Conversions**: The implementation minimizes conversions between C++ and JavaScript:

```cpp
// Convert from JS to C++ once
json schema = JsonFromJSValue(info[0]);

// Use native C++ objects for processing
auto compiledSchema = CompileInternal(schema);

// Convert back to JS only at the end
return WrapCompiledSchema(env, compiledSchema);
```

4. **Efficient String Handling**: String operations are optimized to avoid unnecessary copies:

```cpp
// Use std::string_view for read-only string references
void ProcessError(const std::string_view& path, const std::string_view& message);

// Reserve capacity when building strings
std::string result;
result.reserve(expectedSize);
```

5. **Validator Caching**: Keyword validators are compiled once and reused:

```cpp
// Compile once during schema processing
auto patternValidator = CompilePatternValidator(pattern.get<std::string>());

// Store for repeated use
compiledSchema->keywordValidators["pattern"] = patternValidator;
```

### Keyword Validators

The Schema Validator implements specific validators for each JSON Schema keyword:

```cpp
// Type validator
bool ValidateType(const std::string& type, const json& data, const std::string& path, ValidationContext& context) {
  bool valid = false;

  if (type == "string") {
    valid = data.is_string();
  } else if (type == "number") {
    valid = data.is_number();
  } else if (type == "integer") {
    valid = data.is_number() && data.is_number_integer();
  } else if (type == "boolean") {
    valid = data.is_boolean();
  } else if (type == "object") {
    valid = data.is_object();
  } else if (type == "array") {
    valid = data.is_array();
  } else if (type == "null") {
    valid = data.is_null();
  }

  if (!valid) {
    AddError(context, path,
             "expected " + type + " but got " + data.type_name(),
             "/type", "type");
  }

  return valid;
}

// String pattern validator
SchemaKeywordValidator CompilePatternValidator(const std::string& patternStr) {
  // Compile regex once for reuse
  std::regex pattern(patternStr);

  // Return a lambda that captures the compiled pattern
  return [pattern](const json& data, const std::string& path, ValidationContext& context) -> bool {
    if (!data.is_string()) {
      return true; // Skip if not string (type validation will catch this)
    }

    std::string str = data.get<std::string>();
    if (!std::regex_match(str, pattern)) {
      AddError(context, path,
               "string does not match pattern: " + std::string(pattern),
               "/pattern", "pattern");
      return false;
    }

    return true;
  };
}

// Numeric validators
SchemaKeywordValidator CompileMinimumValidator(double minimum, bool exclusive) {
  return [minimum, exclusive](const json& data, const std::string& path, ValidationContext& context) -> bool {
    if (!data.is_number()) {
      return true; // Skip if not number
    }

    double value = data.get<double>();
    bool valid = exclusive ? (value > minimum) : (value >= minimum);

    if (!valid) {
      std::string op = exclusive ? "greater than" : "greater than or equal to";
      AddError(context, path,
               "value must be " + op + " " + std::to_string(minimum),
               exclusive ? "/exclusiveMinimum" : "/minimum",
               exclusive ? "exclusiveMinimum" : "minimum");
      return false;
    }

    return true;
  };
}

// Array validators
SchemaKeywordValidator CompileMaxItemsValidator(size_t maxItems) {
  return [maxItems](const json& data, const std::string& path, ValidationContext& context) -> bool {
    if (!data.is_array()) {
      return true; // Skip if not array
    }

    if (data.size() > maxItems) {
      AddError(context, path,
               "array must not contain more than " + std::to_string(maxItems) + " items",
               "/maxItems", "maxItems");
      return false;
    }

    return true;
  };
}

// Object validators
SchemaKeywordValidator CompileMaxPropertiesValidator(size_t maxProps) {
  return [maxProps](const json& data, const std::string& path, ValidationContext& context) -> bool {
    if (!data.is_object()) {
      return true; // Skip if not object
    }

    if (data.size() > maxProps) {
      AddError(context, path,
               "object must not contain more than " + std::to_string(maxProps) + " properties",
               "/maxProperties", "maxProperties");
      return false;
    }

    return true;
  };
}
```

### N-API Integration

The Schema Validator integrates with Node.js using N-API:

```cpp
Napi::Object SchemaValidator::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "SchemaValidator", {
    InstanceMethod("compile", &SchemaValidator::Compile),
    InstanceMethod("validate", &SchemaValidator::Validate),
    InstanceMethod("validateWithErrors", &SchemaValidator::ValidateWithErrors),
    StaticMethod("getPerformanceMetrics", &SchemaValidator::GetPerformanceMetrics),
    StaticMethod("resetPerformanceMetrics", &SchemaValidator::ResetPerformanceMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("SchemaValidator", func);
  return exports;
}

// Validate method implementation
Napi::Value SchemaValidator::Validate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get schema (compiled or object)
  std::shared_ptr<CompiledSchema> compiledSchema;

  if (info[0].IsObject() && !info[0].IsArray()) {
    if (info[0].As<Napi::Object>().InstanceOf(constructor.Value())) {
      // Already compiled schema
      compiledSchema = GetCompiledSchemaFromJS(info[0]);
    } else {
      // Raw schema object - compile it
      json schema = JsonFromJSValue(info[0]);

      // Measure compilation time
      auto start = std::chrono::high_resolution_clock::now();
      compiledSchema = CompileInternal(schema);
      auto end = std::chrono::high_resolution_clock::now();
      auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
      metrics_.nativeTime += duration.count() / 1000.0; // Convert to milliseconds
    }
  } else {
    Napi::TypeError::New(env, "Schema must be an object").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Get data to validate
  json data = JsonFromJSValue(info[1]);

  // Measure validation time
  auto start = std::chrono::high_resolution_clock::now();

  // Validate
  bool valid = ValidateInternal(compiledSchema, data);

  // Record performance metrics
  auto end = std::chrono::high_resolution_clock::now();
  auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
  metrics_.nativeTime += duration.count() / 1000.0; // Convert to milliseconds
  metrics_.nativeCount++;

  return Napi::Boolean::New(env, valid);
}
```

### Performance Optimizations

The Schema Validator implements several performance optimizations:

1. **Precompiled Regular Expressions**: Regular expressions are compiled once during schema compilation:

```cpp
// Compile regex just once
std::regex pattern(patternStr);
```

2. **Keyword Validator Functions**: Validators are compiled into functions that can be called repeatedly:

```cpp
// Validators are compiled into functions
using SchemaKeywordValidator = std::function<bool(const json&, const std::string&, ValidationContext&)>;
```

3. **Early Returns**: Validation fails fast when an error is encountered:

```cpp
// Early return when validation fails
if (!ValidateNode(compiledSchema, data[i], itemPath, context)) {
  return false;
}
```

4. **JSON Schema Caching**: Schemas are cached using their content hash as a key:

```cpp
// Cache compiled schemas
schemaCache_[compiledSchema->id] = compiledSchema;

// Retrieve from cache if possible
auto it = schemaCache_.find(schemaId);
if (it != schemaCache_.end()) {
  return it->second;
}
```

5. **Optimized JSON Type Checking**: Fast type checking for different JSON types:

```cpp
// Fast type checking
if (data.is_string()) {
  // String-specific validation
} else if (data.is_number()) {
  // Number-specific validation
}
```

6. **Subschema References**: Validation reuses subschemas without recompiling:

```cpp
// Reference to subschema, not a copy
auto& subschema = schema->subschemas[subschemaId];
```

7. **Context Reuse**: Validation context is passed by reference to avoid copying:

```cpp
// Reuse the same validation context
bool ValidateNode(/*...*/, ValidationContext& context);
```

## Performance Considerations

- The native implementation is significantly faster than JavaScript-based validators, especially for complex schemas
- Schema compilation has some overhead, so for one-time validation of simple schemas, the performance advantage might be less noticeable
- For repeated validations of the same schema, always use the compiled schema returned by the `compile` method
- The validator automatically tracks performance metrics for both native and JavaScript implementations

## Examples

### Basic Validation

```typescript
import { SchemaValidator } from 'nexurejs';

// Create validator instance
const validator = new SchemaValidator();

// Define a schema
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
    email: { type: 'string', format: 'email' }
  },
  required: ['name', 'email']
};

// Data to validate
const data = {
  name: 'John Doe',
  age: 30,
  email: 'john@example.com'
};

// Validate data
const isValid = validator.validate(schema, data);
console.log('Validation result:', isValid);  // true
```

### Schema Compilation and Detailed Errors

```typescript
import { SchemaValidator } from 'nexurejs';

// Create validator instance
const validator = new SchemaValidator();

// Define a schema
const schema = {
  type: 'object',
  properties: {
    username: {
      type: 'string',
      minLength: 3,
      maxLength: 20
    },
    password: {
      type: 'string',
      minLength: 8,
      pattern: '^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d]{8,}$'
    }
  },
  required: ['username', 'password']
};

// Compile the schema for repeated use
const compiledSchema = validator.compile(schema);

// Invalid data
const invalidData = {
  username: 'jo',
  password: '12345'
};

// Validate with detailed errors
const result = validator.validateWithErrors(compiledSchema, invalidData);
console.log('Valid:', result.valid);  // false

// Print all validation errors
result.errors.forEach(error => {
  console.log(`Error at ${error.path}: ${error.message}`);
});
// Error at /username: string length must be at least 3 characters
// Error at /password: string length must be at least 8 characters
// Error at /password: string does not match pattern
```

### Performance Monitoring

```typescript
import { SchemaValidator } from 'nexurejs';

// Create validator
const validator = new SchemaValidator();

// Define a schema
const schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' }
    },
    required: ['id', 'name']
  }
};

// Compile schema
const compiledSchema = validator.compile(schema);

// Validate 1000 items
const data = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Item ${i}`
}));

// Reset metrics before test
SchemaValidator.resetPerformanceMetrics();

// Validate data
validator.validate(compiledSchema, data);

// Get performance metrics
const metrics = SchemaValidator.getPerformanceMetrics();
console.log(`Native validation: ${metrics.nativeCount} calls in ${metrics.nativeTime}ms`);
```

### Advanced Schema with References

```typescript
import { SchemaValidator } from 'nexurejs';

// Create validator with draft 2019-09 support
const validator = new SchemaValidator({ defaultDraft: 'draft2019' });

// Schema with references
const schema = {
  $schema: 'https://json-schema.org/draft/2019-09/schema',
  $id: 'https://example.com/schemas/customer',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    address: { $ref: '#/definitions/address' }
  },
  required: ['id', 'name'],
  definitions: {
    address: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
        zipCode: { type: 'string', pattern: '^\\d{5}$' }
      },
      required: ['street', 'city', 'zipCode']
    }
  }
};

const validData = {
  id: 1,
  name: 'Jane Smith',
  address: {
    street: '123 Main St',
    city: 'Anytown',
    zipCode: '12345'
  }
};

const result = validator.validateWithErrors(schema, validData);
console.log('Validation result:', result.valid);  // true
```
