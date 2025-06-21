# NexureJS Technical Guide

This guide provides an in-depth look at the internal architecture and design principles of NexureJS. It's intended for developers who want to understand how the framework works under the hood, contribute to the codebase, or implement advanced customizations.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Request Lifecycle](#request-lifecycle)
- [Native Modules](#native-modules)
- [Performance Optimizations](#performance-optimizations)
- [Design Decisions](#design-decisions)
- [Extension Points](#extension-points)

## Architecture Overview

NexureJS follows a modular architecture designed for performance, flexibility, and ease of use. The framework is structured around the following key principles:

1. **Separation of Concerns**: Each component has well-defined responsibilities and interfaces
2. **Progressive Enhancement**: Core functionality works without native modules, which provide optional performance boosts
3. **Lazy Loading**: Components and features are loaded on-demand to minimize memory footprint
4. **Minimal Dependencies**: Limited external dependencies to reduce complexity and security risks
5. **Developer Experience**: Clear APIs and consistent patterns for predictable behavior

The high-level architecture consists of:

```
┌───────────────────────────────────────────────────────────┐
│                  Application (Nexure)                     │
├───────────┬───────────┬────────────┬────────────┬─────────┤
│           │           │            │            │         │
│  Routing  │ Middleware│  Request/  │   Error    │  Utils  │
│           │           │  Response  │  Handling  │         │
├───────────┴───────────┴────────────┴────────────┴─────────┤
│                     Native Modules                        │
│      (HTTP Parser, Router, JSON Processor, etc.)          │
├───────────────────────────────────────────────────────────┤
│                    Node.js Core                           │
└───────────────────────────────────────────────────────────┘
```

## Core Components

### HTTP Server

The HTTP server is the entry point for handling requests. NexureJS wraps Node.js's native `http` module with additional functionality:

- Request and response enhancements
- Error handling
- Middleware pipeline
- Stream processing

### Router

The router is responsible for matching incoming requests to handlers:

- Uses a high-performance radix tree for route matching
- Supports route parameters (`:id`) and wildcards
- Routes are compiled and optimized at registration time
- Available in both JavaScript and native C++ implementations

### Middleware System

The middleware system provides a pipeline for processing requests:

- Simple functional interface: `(req, res, next) => void`
- Asynchronous middleware support with promises
- Error handling middleware with signature `(err, req, res, next) => void`
- Global and route-specific middleware

### Request/Response Objects

Enhanced versions of Node.js's request and response objects:

- Type-safe interfaces
- Helper methods for common operations (JSON parsing, body handling)
- Streaming support
- Chainable API for response methods

### Error Handling

Comprehensive error handling system:

- Custom error classes for different HTTP status codes
- Detailed error information (message, code, metadata)
- Development vs. production error formatting
- Async error support

## Request Lifecycle

The lifecycle of a request in NexureJS:

1. **HTTP Parsing**: The raw HTTP request is parsed (using native parser if available)
2. **Request Object Creation**: Create enhanced request and response objects
3. **Middleware Execution**: Execute global middleware
4. **Route Matching**: Find the matching route using the router
5. **Parameter Extraction**: Extract route parameters
6. **Route-Specific Middleware**: Execute route-specific middleware
7. **Handler Execution**: Execute the route handler
8. **Response Generation**: Generate and send the response
9. **Error Handling**: Handle any errors that occur during the process

If an error occurs at any point, the framework jumps to the error handling phase, skipping intermediate steps.

## Native Modules

NexureJS uses native C++ modules for performance-critical operations:

### Implementation Strategy

Native modules are implemented using Node.js's N-API for ABI stability across Node.js versions. Each module:

1. Has a JavaScript implementation as a fallback
2. Is abstracted behind a common interface
3. Exposes metrics for performance comparison

### Key Native Modules

- **HttpParser**: Fast parsing of HTTP requests
- **RadixRouter**: Efficient route matching
- **JsonProcessor**: Optimized JSON parsing and serialization
- **ValidationEngine**: Schema-based validation

### Automatic Fallback

The framework automatically detects if native modules are available:

- If prebuilt binaries exist for the platform, they're used
- If not, the framework gracefully falls back to JavaScript implementations
- Users can force JavaScript implementation with `--force-js` flag

## Performance Optimizations

### Buffer Pooling

NexureJS uses buffer pools to reduce garbage collection pressure:

- Buffers are reused instead of being allocated and garbage-collected
- Pool size adapts to workload
- Different pools for different buffer sizes

### Adaptive Buffer Sizing

The framework dynamically adjusts buffer sizes based on workload:

- Start with small buffers for efficiency
- Grow buffers if needed to handle larger payloads
- Shrink back to smaller buffers after handling large requests

### Stream Processing

Request bodies are processed as streams for memory efficiency:

- Large payloads don't require full buffering in memory
- Processing can begin before the entire payload is received
- Stream transformations for efficient processing

### Lazy Parsing

Headers and bodies are parsed on-demand:

- If a request handler doesn't need the body, it's not parsed
- Headers are parsed incrementally as needed
- Query parameters are parsed only when accessed

## Design Decisions

### Why Not Use Express/Koa Middleware?

While Express and Koa have established middleware patterns, NexureJS uses a similar but enhanced middleware system that:

- Supports both synchronous and asynchronous middleware seamlessly
- Has better TypeScript integration
- Optimizes for performance with reduced overhead
- Maintains compatibility with many existing middleware through adapters

### JavaScript vs. TypeScript

NexureJS is written in TypeScript but designed to be used comfortably from both JavaScript and TypeScript:

- All TypeScript types are included in the package
- JavaScript examples don't require TypeScript knowledge
- Documentation covers both JavaScript and TypeScript usage

### Error First vs. Exception Based

Unlike some Node.js libraries that use error-first callbacks, NexureJS uses exceptions and promises for error handling:

- More natural control flow
- Better integration with async/await
- Comprehensive error classes for different error types
- Global error handling for consistency

### Dependency Injection Strategy

NexureJS supports dependency injection for complex applications:

- Not required for simple applications
- Class-based approach for more complex apps
- Services can be registered with different scopes (singleton, request, transient)

## Extension Points

NexureJS provides several extension points for customization:

### Custom Middleware

Create custom middleware for reusable functionality:

```javascript
const customMiddleware = (options) => {
  return (req, res, next) => {
    // Middleware logic here
    next();
  };
};

app.use(customMiddleware({ /* options */ }));
```

### Custom Error Handlers

Register custom error handlers for specialized error processing:

```javascript
app.setErrorHandler((error, req, res) => {
  // Custom error handling logic
  res.status(500).json({ error: error.message });
});
```

### Plugin System

The plugin system allows extending core functionality:

```javascript
app.registerPlugin({
  name: 'custom-plugin',
  version: '1.0.0',
  setup: (app) => {
    // Plugin setup logic
  }
});
```

### Custom Response Formatters

Add custom response types beyond JSON, text, and HTML:

```javascript
app.addResponseFormatter('xml', (data) => {
  return convertToXML(data);
}, 'application/xml');
```

### Custom Validation Rules

Extend the validation system with custom rules:

```javascript
app.addValidationRule('isPostalCode', (value, country) => {
  // Validation logic
  return isValidPostalCode(value, country);
});
```

## Internal APIs

These APIs are used internally and may change between minor versions:

### HTTP Parser Internals

```javascript
// Internal API, not recommended for direct use
const parser = new HttpParser();
const result = parser.parse(buffer);
```

### Router Compilation

```javascript
// Internal API, not recommended for direct use
const routeNode = compileRoute(pattern);
```

### Middleware Resolver

```javascript
// Internal API, not recommended for direct use
const middlewareChain = resolveMiddleware(middlewareArray);
```

## Contributing

For information on contributing to NexureJS, please see the [CONTRIBUTING.md](../CONTRIBUTING.md) file.
