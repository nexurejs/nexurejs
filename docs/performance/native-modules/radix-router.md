# Radix Router Native Module

## Overview

The Radix Router is a high-performance C++ implementation of a radix tree-based HTTP routing system. It provides significantly faster route matching compared to JavaScript-based alternatives, especially for applications with many routes and complex path patterns.

## Features

- Extremely fast route matching using radix tree (prefix tree) structure
- Support for path parameters (e.g., `/users/:id`)
- Method-based routing (GET, POST, PUT, DELETE, etc.)
- Optional route caching for even faster performance
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor(options?: { maxCacheSize?: number })
```

Creates a new instance of the Radix Router. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

**Parameters:**
- `options?: { maxCacheSize?: number }` - Optional configuration object
  - `maxCacheSize?: number` - Maximum number of routes to cache (default: 1000)

### Methods

#### `add(method: string, path: string, handler: any): this`

Adds a route to the router.

**Parameters:**
- `method: string` - HTTP method (GET, POST, PUT, DELETE, etc.)
- `path: string` - URL path pattern (e.g., `/users/:id`)
- `handler: any` - Handler to be executed when the route is matched

**Returns:**
- `this` - Returns the router instance for method chaining

#### `find(method: string, path: string): RouteMatch`

Finds a route matching the given method and path.

**Parameters:**
- `method: string` - HTTP method (GET, POST, PUT, DELETE, etc.)
- `path: string` - URL path to match

**Returns:**
```typescript
interface RouteMatch {
  handler: any;
  params: Record<string, string>;
  found: boolean;
}
```

#### `remove(method: string, path: string): boolean`

Removes a route from the router.

**Parameters:**
- `method: string` - HTTP method (GET, POST, PUT, DELETE, etc.)
- `path: string` - URL path pattern to remove

**Returns:**
- `boolean` - True if the route was found and removed, false otherwise

### Static Methods

#### `getPerformanceMetrics(): { jsTime: number; jsCount: number; nativeTime: number; nativeCount: number }`

Returns performance metrics for both JavaScript and native implementations.

**Returns:**
- `jsTime` - Total time spent in JavaScript router (ms)
- `jsCount` - Number of times JavaScript router was used
- `nativeTime` - Total time spent in native router (ms)
- `nativeCount` - Number of times native router was used

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The Radix Router native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. It uses a highly optimized radix tree structure to efficiently match routes by storing common prefixes only once.

### Radix Tree Structure

The radix tree implementation:
- Stores routes in a tree structure where each node represents a segment of the path
- Optimizes memory usage by sharing common prefixes
- Handles path parameters with special node types
- Provides O(k) lookup time, where k is the length of the path being matched

## C++ Implementation Explained

### Core Classes and Data Structures

#### `RadixNode` Class

The radix tree is built using a hierarchy of nodes, with each node representing a path segment:

```cpp
class RadixNode {
public:
  RadixNode();
  ~RadixNode();

  // Node types
  enum class Type {
    Static,   // Normal path segment (e.g., "users")
    Param,    // Parameter segment (e.g., ":id")
    CatchAll, // Catch-all segment (e.g., "*")
    Root      // Root node of the tree
  };

  // Node properties
  Type type;
  std::string path;
  std::string paramName;
  std::unordered_map<std::string, RouteHandler> handlers; // Method -> handler map
  std::vector<std::unique_ptr<RadixNode>> children;
  RadixNode* parent;

  // Node methods
  void AddChild(std::unique_ptr<RadixNode> child);
  RadixNode* FindChild(const std::string& path, bool isParam = false);
  bool RemoveChild(const std::string& path);
};
```

#### `RouteCache` Class

To optimize performance further, the router uses an LRU (Least Recently Used) cache:

```cpp
class RouteCache {
public:
  RouteCache(size_t maxSize);

  // Cache operations
  void Set(const std::string& key, const RouteMatch& match);
  bool Get(const std::string& key, RouteMatch& match);
  void Clear();

private:
  struct CacheEntry {
    RouteMatch match;
    std::list<std::string>::iterator lruIterator;
  };

  size_t maxSize_;
  std::unordered_map<std::string, CacheEntry> cache_;
  std::list<std::string> lruList_; // Front = most recently used
};
```

#### `RadixRouter` Class

The main router class that integrates with Node.js:

```cpp
class RadixRouter : public Napi::ObjectWrap<RadixRouter> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  RadixRouter(const Napi::CallbackInfo& info);
  ~RadixRouter();

private:
  // Node.js API methods
  Napi::Value Add(const Napi::CallbackInfo& info);
  Napi::Value Find(const Napi::CallbackInfo& info);
  Napi::Value Remove(const Napi::CallbackInfo& info);
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // Internal implementation
  bool AddRoute(const std::string& method, const std::string& path, const Napi::Value& handler);
  RouteMatch FindRoute(const std::string& method, const std::string& path);
  bool RemoveRoute(const std::string& method, const std::string& path);

  // Tree manipulation
  void InsertNode(RadixNode* node, const std::string& path,
                  const std::string& method, const Napi::Value& handler);
  RadixNode* FindNodeAndCollectParams(RadixNode* node, const std::string& path,
                                     std::unordered_map<std::string, std::string>& params);

  // Tree root and cache
  std::unique_ptr<RadixNode> root_;
  std::unique_ptr<RouteCache> cache_;
  size_t maxCacheSize_;

  // Performance metrics
  static PerformanceMetrics metrics_;
};
```

### Route Addition Algorithm

The process of adding a route to the radix tree is quite complex, involving prefix matching and tree manipulation:

```cpp
void RadixRouter::InsertNode(RadixNode* node, const std::string& path,
                             const std::string& method, const Napi::Value& handler) {
  // Process path segments
  std::vector<std::string> segments = SplitPath(path);

  RadixNode* current = node;

  for (size_t i = 0; i < segments.size(); i++) {
    std::string segment = segments[i];
    bool isLast = (i == segments.size() - 1);

    // Handle parameter segments
    if (segment.length() > 0 && segment[0] == ':') {
      // Parameter node handling
      std::string paramName = segment.substr(1);
      RadixNode* paramNode = current->FindChild("", true);

      if (!paramNode) {
        // Create new parameter node
        auto newNode = std::make_unique<RadixNode>();
        newNode->type = RadixNode::Type::Param;
        newNode->paramName = paramName;
        newNode->parent = current;

        if (isLast) {
          // Store handler in the node
          newNode->handlers[method] = CreatePersistentHandler(handler);
        }

        current->AddChild(std::move(newNode));
        current = current->children.back().get();
      } else {
        // Update existing parameter node
        paramNode->paramName = paramName;

        if (isLast) {
          paramNode->handlers[method] = CreatePersistentHandler(handler);
        }

        current = paramNode;
      }
    } else {
      // Static path segment handling
      RadixNode* child = current->FindChild(segment);

      if (!child) {
        // Create new node
        auto newNode = std::make_unique<RadixNode>();
        newNode->type = RadixNode::Type::Static;
        newNode->path = segment;
        newNode->parent = current;

        if (isLast) {
          newNode->handlers[method] = CreatePersistentHandler(handler);
        }

        current->AddChild(std::move(newNode));
        current = current->children.back().get();
      } else {
        // Update existing node
        if (isLast) {
          child->handlers[method] = CreatePersistentHandler(handler);
        }

        current = child;
      }
    }
  }
}
```

### Route Matching Algorithm

The route matching algorithm traverses the radix tree to find the best match:

```cpp
RadixNode* RadixRouter::FindNodeAndCollectParams(RadixNode* node, const std::string& path,
                                               std::unordered_map<std::string, std::string>& params) {
  // Split path into segments
  std::vector<std::string> segments = SplitPath(path);

  RadixNode* current = node;

  for (size_t i = 0; i < segments.size(); i++) {
    std::string segment = segments[i];

    // Try to find exact static match first
    RadixNode* matchedNode = current->FindChild(segment);

    if (matchedNode) {
      // Found exact static match
      current = matchedNode;
    } else {
      // Try parameter nodes
      RadixNode* paramNode = current->FindChild("", true);

      if (paramNode) {
        // Found parameter match
        params[paramNode->paramName] = segment;
        current = paramNode;
      } else {
        // No match found
        return nullptr;
      }
    }
  }

  // Check if the node has any handlers
  if (current->handlers.empty()) {
    return nullptr;
  }

  return current;
}

RouteMatch RadixRouter::FindRoute(const std::string& method, const std::string& path) {
  // Check cache first
  std::string cacheKey = method + ":" + path;
  RouteMatch cachedMatch;

  if (cache_ && cache_->Get(cacheKey, cachedMatch)) {
    return cachedMatch;
  }

  // Not in cache, perform tree search
  std::unordered_map<std::string, std::string> params;
  RadixNode* node = FindNodeAndCollectParams(root_.get(), path, params);

  RouteMatch match;
  match.found = false;

  if (node) {
    auto it = node->handlers.find(method);

    if (it != node->handlers.end()) {
      // Found matching handler for method
      match.found = true;
      match.handler = it->second;
      match.params = std::move(params);

      // Add to cache if enabled
      if (cache_) {
        cache_->Set(cacheKey, match);
      }
    }
  }

  return match;
}
```

### Memory Management

The implementation uses modern C++ idioms for memory management:

1. **Smart Pointers**: `std::unique_ptr` is used for hierarchical node ownership:

```cpp
// Node ownership with smart pointers
std::vector<std::unique_ptr<RadixNode>> children;
```

2. **Resource Management**: JavaScript values are properly wrapped in persistent references:

```cpp
// Create persistent handler reference
RouteHandler CreatePersistentHandler(const Napi::Value& handler) {
  if (handler.IsFunction() || handler.IsObject()) {
    RouteHandler persistent = Napi::Persistent(handler);
    persistent.SuppressDestruct();
    return persistent;
  }
  return {};
}
```

3. **Cleanup**: The destructor properly releases all resources:

```cpp
RadixRouter::~RadixRouter() {
  // Clear the cache
  if (cache_) {
    cache_->Clear();
  }

  // Release all handlers
  std::function<void(RadixNode*)> releaseHandlers = [&](RadixNode* node) {
    for (auto& handler : node->handlers) {
      if (!handler.second.IsEmpty()) {
        handler.second.Reset();
      }
    }

    for (auto& child : node->children) {
      releaseHandlers(child.get());
    }
  };

  releaseHandlers(root_.get());
}
```

### N-API Integration

The router integrates with Node.js using N-API:

```cpp
Napi::Object RadixRouter::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "RadixRouter", {
    InstanceMethod("add", &RadixRouter::Add),
    InstanceMethod("find", &RadixRouter::Find),
    InstanceMethod("remove", &RadixRouter::Remove),
    StaticMethod("getPerformanceMetrics", &RadixRouter::GetPerformanceMetrics),
    StaticMethod("resetPerformanceMetrics", &RadixRouter::ResetPerformanceMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("RadixRouter", func);
  return exports;
}

RadixRouter::RadixRouter(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<RadixRouter>(info), maxCacheSize_(1000) {

  Napi::Env env = info.Env();

  // Initialize root node
  root_ = std::make_unique<RadixNode>();
  root_->type = RadixNode::Type::Root;

  // Check for options
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("maxCacheSize") && options.Get("maxCacheSize").IsNumber()) {
      maxCacheSize_ = options.Get("maxCacheSize").As<Napi::Number>().Uint32Value();
    }
  }

  // Initialize cache if size > 0
  if (maxCacheSize_ > 0) {
    cache_ = std::make_unique<RouteCache>(maxCacheSize_);
  }
}
```

### Performance Optimizations

Several optimizations enhance the router's performance:

1. **Path Normalization**: The router normalizes paths to ensure consistent matching:

```cpp
std::string NormalizePath(const std::string& path) {
  std::string normalized = path;

  // Ensure path starts with '/'
  if (normalized.empty() || normalized[0] != '/') {
    normalized = '/' + normalized;
  }

  // Remove trailing slash if not root
  if (normalized.length() > 1 && normalized.back() == '/') {
    normalized.pop_back();
  }

  return normalized;
}
```

2. **Optimized Split Function**: Fast path splitting without regular expressions:

```cpp
std::vector<std::string> SplitPath(const std::string& path) {
  std::vector<std::string> segments;

  size_t start = 0;
  size_t end = 0;

  // Skip leading slash
  if (!path.empty() && path[0] == '/') {
    start = 1;
  }

  while (start < path.length()) {
    // Find next slash
    end = path.find('/', start);

    if (end == std::string::npos) {
      end = path.length();
    }

    // Extract segment
    if (end > start) {
      segments.push_back(path.substr(start, end - start));
    }

    start = end + 1;
  }

  return segments;
}
```

3. **LRU Cache Implementation**: Efficient caching for frequently accessed routes:

```cpp
void RouteCache::Set(const std::string& key, const RouteMatch& match) {
  // Check if key already exists
  auto it = cache_.find(key);

  if (it != cache_.end()) {
    // Update existing entry
    it->second.match = match;

    // Move to front of LRU list
    lruList_.erase(it->second.lruIterator);
    lruList_.push_front(key);
    it->second.lruIterator = lruList_.begin();
  } else {
    // Check cache size limit
    if (cache_.size() >= maxSize_) {
      // Remove least recently used item
      std::string lruKey = lruList_.back();
      cache_.erase(lruKey);
      lruList_.pop_back();
    }

    // Add new entry
    lruList_.push_front(key);
    cache_[key] = { match, lruList_.begin() };
  }
}

bool RouteCache::Get(const std::string& key, RouteMatch& match) {
  auto it = cache_.find(key);

  if (it == cache_.end()) {
    return false;
  }

  // Update LRU position
  lruList_.erase(it->second.lruIterator);
  lruList_.push_front(key);
  it->second.lruIterator = lruList_.begin();

  // Return match
  match = it->second.match;
  return true;
}
```

4. **Cache-friendly Data Structures**: The implementation uses cache-friendly data structures:

```cpp
// Using flat std::vector for small collections where cache locality is more important than lookup time
std::vector<std::unique_ptr<RadixNode>> children;

// Using std::unordered_map for larger collections where lookup time is critical
std::unordered_map<std::string, RouteHandler> handlers;
```

5. **Parameter Extraction Optimization**: Efficient parameter extraction during matching:

```cpp
// Optimized parameter extraction with pre-allocated map
void ExtractParams(const std::vector<ParamDefinition>& paramDefs,
                  const std::vector<std::string>& segments,
                  std::unordered_map<std::string, std::string>& params) {
  params.reserve(paramDefs.size()); // Pre-allocate map size

  for (const auto& param : paramDefs) {
    if (param.index < segments.size()) {
      params.emplace(param.name, segments[param.index]);
    }
  }
}
```

## Performance Considerations

- The native implementation is significantly faster than the JavaScript implementation, especially for applications with many routes
- Route caching provides additional performance benefits for frequently accessed routes
- Parameter extraction is optimized for minimal memory allocation during route matching
- For applications with a small number of simple routes, the overhead of crossing the JavaScript/C++ boundary might reduce the performance advantage

## Examples

### Basic Usage

```typescript
import { RadixRouter } from 'nexurejs';

// Create a new router instance with default cache size
const router = new RadixRouter();

// Add routes
router.add('GET', '/users', getAllUsersHandler);
router.add('GET', '/users/:id', getUserByIdHandler);
router.add('POST', '/users', createUserHandler);
router.add('PUT', '/users/:id', updateUserHandler);
router.add('DELETE', '/users/:id', deleteUserHandler);

// Find a route
const { handler, params, found } = router.find('GET', '/users/123');

if (found) {
  console.log(params); // { id: '123' }
  handler(params); // Call the matched handler
}

// Remove a route
const removed = router.remove('DELETE', '/users/:id');
console.log(removed); // true
```

### Custom Cache Size

```typescript
import { RadixRouter } from 'nexurejs';

// Create a router with a custom cache size
const router = new RadixRouter({ maxCacheSize: 5000 });

// ... add routes and use the router
```

### Performance Monitoring

```typescript
import { RadixRouter } from 'nexurejs';

// Get performance metrics
const metrics = RadixRouter.getPerformanceMetrics();
console.log(`Native router: ${metrics.nativeCount} calls in ${metrics.nativeTime}ms`);
console.log(`JS router: ${metrics.jsCount} calls in ${metrics.jsTime}ms`);

// Reset metrics
RadixRouter.resetPerformanceMetrics();
```
