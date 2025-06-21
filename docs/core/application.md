# NexureJS Framework Guide

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Core Components](#core-components)
  - [Routing](#routing)
  - [Middleware](#middleware)
  - [Request Handling](#request-handling)
  - [Response Handling](#response-handling)
- [Advanced Topics](#advanced-topics)
  - [Native Modules](#native-modules)
  - [Streaming](#streaming)
  - [WebSockets](#websockets)
  - [Performance Optimizations](#performance-optimizations)
- [Documentation Index](#documentation-index)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Introduction

NexureJS is a high-performance, modular Node.js framework designed with modern developer experience in mind. It combines the best aspects of popular frameworks with native performance optimizations.

### Key Features

- **High Performance**: Native C++ modules for performance-critical operations
- **Modern JavaScript & TypeScript Support**: First-class TypeScript support
- **Intuitive API**: Simple, expressive API for routing and middleware
- **Streaming Support**: Advanced streaming capabilities for efficient data processing
- **WebSocket Support**: Built-in WebSocket capabilities
- **Middleware System**: Flexible middleware architecture
- **Modular Design**: Use only what you need

## Installation

### Prerequisites

- Node.js 18.0.0 or later
- npm or yarn

### Basic Installation

```bash
npm install nexurejs
```

For TypeScript users, TypeScript typings are included in the package.

### Native Modules

NexureJS includes native C++ modules for performance optimization. The installation will automatically attempt to download pre-built binaries for your platform. If no pre-built binary is available, it will fallback to a pure JavaScript implementation.

To force using the JavaScript implementation:

```bash
npm install nexurejs --force-js
```

## Getting Started

### Creating a Basic Server

```javascript
import { Nexure, HttpMethod } from 'nexurejs';

// Create a new Nexure application instance
const app = new Nexure();

// Define a route
app.route({
  path: '/',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({ message: 'Hello, NexureJS!' });
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

### Project Structure

A typical NexureJS project structure looks like this:

```bash
my-nexure-app/
├── src/
│   ├── routes/
│   │   ├── user-routes.js
│   │   └── auth-routes.js
│   ├── middleware/
│   │   ├── logger.js
│   │   └── auth.js
│   ├── handlers/
│   │   ├── user-handlers.js
│   │   └── auth-handlers.js
│   ├── utils/
│   │   └── helpers.js
│   └── app.js
├── tests/
├── package.json
└── README.md
```

### Configuration Options

NexureJS can be configured with various options:

```javascript
const app = new Nexure({
  // Enable logging
  logging: true,

  // Enable pretty JSON responses
  prettyJson: true,

  // Global prefix for all routes
  globalPrefix: '/api',

  // WebSocket options
  websocket: {
    enabled: true,
    config: {
      // WebSocket server configuration
    }
  },

  // Performance optimization options
  performance: {
    nativeModules: true,
    forceNativeModules: false,
    nativeModuleConfig: {
      verbose: false,
      maxCacheSize: 1000,
      preloadModules: true
    },
    gcInterval: 0,
    maxMemoryMB: 0
  },

  // Body parser options
  bodyParser: {
    streaming: false,
    streamOptions: {
      highWaterMark: 64 * 1024,
      maxSize: 10 * 1024 * 1024
    }
  },

  // Logger configuration
  logger: {
    level: 'info',
    prettyPrint: false
  }
});
```

For a complete list of configuration options, see the [API Reference](./API_REFERENCE.md#nexure-class).

## Core Components

### Routing

NexureJS provides a flexible routing system with support for route parameters, query parameters, and different HTTP methods.

#### Basic Routing

```javascript
import { Nexure, HttpMethod } from 'nexurejs';

const app = new Nexure();

// Define routes
app.route({
  path: '/',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({ message: 'Welcome to NexureJS' });
  }
});

app.route({
  path: '/users',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({ users: [] });
  }
});

app.route({
  path: '/users/:id',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const userId = req.params.id;
    res.status(200).json({ id: userId, name: `User ${userId}` });
  }
});

app.route({
  path: '/users',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    const userData = await req.json();
    res.status(201).json({ id: 1, ...userData });
  }
});
```

#### Route Parameters

Route parameters can be defined using the colon syntax in the path and are available in `req.params`:

```javascript
app.route({
  path: '/users/:id/posts/:postId',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const { id, postId } = req.params;
    res.status(200).json({ userId: id, postId });
  }
});
```

#### Query Parameters

Query parameters are automatically parsed and available in `req.query`:

```javascript
app.route({
  path: '/search',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const { q, limit, page } = req.query;
    res.status(200).json({
      query: q,
      limit: parseInt(limit) || 10,
      page: parseInt(page) || 1
    });
  }
});
```

### Middleware

Middleware functions are functions that have access to the request object, the response object, and the next middleware function in the application's request-response cycle.

#### Creating Middleware

```javascript
// Simple logger middleware
const logger = (req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message
  });
};
```

#### Using Middleware

```javascript
// Global middleware (applied to all routes)
app.use(logger);

// Route-specific middleware
app.route({
  path: '/admin',
  method: HttpMethod.GET,
  middleware: [authMiddleware, adminOnlyMiddleware],
  handler: (req, res) => {
    res.status(200).json({ message: 'Admin dashboard' });
  }
});

// Error handling middleware (should be registered last)
app.use(errorHandler);
```

### Request Handling

#### Body Parsing

Parse request body using async methods:

```javascript
app.route({
  path: '/users',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    try {
      // Parse JSON body
      const body = await req.json();

      // Validate body
      if (!body.name || !body.email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }

      // Process body
      res.status(201).json({ id: 1, ...body });
    } catch (err) {
      res.status(400).json({ error: 'Invalid JSON' });
    }
  }
});
```

#### Streaming

Process request body as a stream for large uploads:

```javascript
app.route({
  path: '/upload',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    try {
      const stream = req.stream();
      const writeStream = fs.createWriteStream('/path/to/file');

      await pipeline(stream, writeStream);

      res.status(200).json({ message: 'Upload complete' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
});
```

### Response Handling

#### JSON Response

Send JSON response:

```javascript
res.status(200).json({ message: 'Success', data: {} });
```

#### Text Response

Send text response:

```javascript
res.status(200).text('Success');
```

#### HTML Response

Send HTML response:

```javascript
res.status(200).html('<h1>Hello World</h1>');
```

#### Stream Response

Respond with a stream:

```javascript
const fileStream = fs.createReadStream('/path/to/file');

res.status(200)
  .setHeader('Content-Type', 'application/octet-stream')
  .stream(fileStream);
```

## Advanced Topics

### Native Modules

NexureJS includes native C++ modules for performance-critical operations, which are used automatically when available. You can control their usage:

```javascript
import { isNative, isNativeAvailable, forceJavaScriptFallback } from 'nexurejs';

console.log(`Using native implementation: ${isNative}`);
console.log(`Native implementation available: ${isNativeAvailable()}`);

// Force JavaScript fallback
forceJavaScriptFallback();

// Configuration through Nexure constructor
const app = new Nexure({
  performance: {
    nativeModules: true,
    forceNativeModules: false,
    nativeModuleConfig: {
      verbose: true,
      maxCacheSize: 1000
    }
  }
});
```

### Streaming

NexureJS provides advanced streaming capabilities for efficient processing of large data:

```javascript
app.route({
  path: '/download',
  method: HttpMethod.GET,
  handler: async (req, res) => {
    const fileStream = fs.createReadStream('/path/to/large/file');

    // Transform the stream (e.g., to add compression)
    const gzip = zlib.createGzip();

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Encoding', 'gzip');

    await pipeline(fileStream, gzip, res.stream());
  }
});
```

For more advanced streaming examples, see the [Streaming Example](../examples/performance/streaming.js) and [API Reference](./API_REFERENCE.md#streaming).

### WebSockets

NexureJS includes built-in WebSocket support:

```javascript
import { Nexure } from 'nexurejs';

const app = new Nexure({
  websocket: {
    enabled: true,
    config: {
      // WebSocket configuration
    }
  }
});

// Get the WebSocket server
const wsServer = app.getWebSocketServer();

// Handle WebSocket connections
wsServer.on('connection', (connection) => {
  console.log('New WebSocket connection');

  // Send a message to the client
  connection.send({ type: 'welcome', message: 'Hello!' });

  // Add the connection to a room
  connection.joinRoom('general');
});

// Handle WebSocket messages
wsServer.on('message', (connection, message) => {
  console.log('Received message:', message);

  // Echo the message back
  connection.send({ type: 'echo', data: message });
});

// Broadcast to all clients in a room
wsServer.broadcastToRoom('general', {
  type: 'announcement',
  message: 'Hello everyone!'
});

// Start the server
app.listen(3000);
```

### Performance Optimizations

NexureJS includes various performance optimizations:

1. **Buffer Pooling**: Reusing buffers to reduce garbage collection
2. **Adaptive Buffer Sizing**: Dynamically adjusting buffer size based on workload
3. **Streaming Body Processing**: Efficiently processing request bodies as streams
4. **Native Modules**: Using C++ for performance-critical operations

## Documentation Index

NexureJS provides comprehensive documentation:

- [API Reference](./API_REFERENCE.md) - Complete reference of all APIs and features
- [Examples Guide](./EXAMPLES.md) - Detailed guide to all example applications
- [Main README](../README.md) - Project overview and basic usage

## Examples

The [examples directory](../examples/) contains various example applications that demonstrate how to use NexureJS features in real-world scenarios:

- **Basic Examples**: Simple examples to get started with NexureJS
- **API Development**: Examples showing how to build RESTful APIs
- **Performance**: Demonstrations of performance optimizations
- **Security**: Security best practices and implementations
- **Advanced Features**: Examples showcasing more complex features

For detailed information on all examples, see the [Examples Guide](./EXAMPLES.md).

## Troubleshooting

### Common Issues

#### Native Modules Not Loading

If native modules fail to load, NexureJS will automatically fall back to pure JavaScript implementations. To troubleshoot:

1. Check if your platform is supported
2. Ensure you have the necessary build tools installed
3. Try reinstalling the package

```bash
# Force rebuild of native modules
npm rebuild nexurejs

# Or install with verbose logging
npm install nexurejs --verbose
```

#### Streaming Issues

If you encounter issues with streaming:

1. Ensure you have enabled streaming in the options
2. Check if you're correctly using the stream API
3. Verify that you're handling stream errors

```javascript
// Enable streaming
const app = new Nexure({
  bodyParser: {
    streaming: true,
    streamOptions: {
      highWaterMark: 64 * 1024, // 64KB chunks
      maxSize: 100 * 1024 * 1024 // 100MB limit
    }
  }
});

// Handle stream errors
try {
  await pipeline(
    req.stream(),
    transform,
    destination
  );
} catch (err) {
  console.error('Streaming error:', err);
}
```

For more detailed examples and troubleshooting, refer to our [Examples Guide](./EXAMPLES.md) and [API Reference](./API_REFERENCE.md).
