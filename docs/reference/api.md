# NexureJS API Reference

## Table of Contents

- [Nexure Class](#nexure-class)
- [Routing](#routing)
- [HTTP Methods](#http-methods)
- [Middleware](#middleware)
- [Request Handling](#request-handling)
- [Response Methods](#response-methods)
- [Error Handling](#error-handling)
- [WebSockets](#websockets)
- [Native Modules](#native-modules)
- [Streaming](#streaming)
- [Validation](#validation)
- [File Operations](#file-operations)
- [Utility Functions](#utility-functions)

## Nexure Class

The main application class that handles routing, middleware, and server operations.

### Constructor

```typescript
constructor(options: NexureOptions = {})
```

Creates a new Nexure application instance with the specified options.

### Options

```typescript
export interface NexureOptions {
  /**
   * Enable logging
   * @default true
   */
  logging?: boolean;

  /**
   * Enable pretty JSON responses
   * @default false
   */
  prettyJson?: boolean;

  /**
   * Global prefix for all routes
   * @default ''
   */
  globalPrefix?: string;

  /**
   * WebSocket options
   */
  websocket?: {
    /**
     * Enable WebSocket support
     * @default true
     */
    enabled?: boolean;

    /**
     * Advanced WebSocket configuration
     */
    config?: WebSocketServerOptions;
  };

  /**
   * Performance optimization options
   * @default { nativeModules: true, gcInterval: 0 }
   */
  performance?: {
    /**
     * Enable native modules for performance-critical operations
     * @default true
     */
    nativeModules?: boolean;

    /**
     * Force using native modules even when they might not be fully compatible
     * @default false
     */
    forceNativeModules?: boolean;

    /**
     * Native module configuration
     */
    nativeModuleConfig?: {
      /**
       * Enable verbose logging for native modules
       * @default false
       */
      verbose?: boolean;

      /**
       * Maximum size for route cache
       * @default 1000
       */
      maxCacheSize?: number;

      /**
       * Preload all available native modules on startup
       * @default true
       */
      preloadModules?: boolean;
    };

    /**
     * Interval in ms to force garbage collection if available (0 = disabled)
     * @default 0
     */
    gcInterval?: number;

    /**
     * Max memory usage in MB before forced GC (0 = disabled)
     * @default 0
     */
    maxMemoryMB?: number;
  };

  /**
   * Body parser options
   */
  bodyParser?: {
    /**
     * Enable streaming body parsing
     * @default false
     */
    streaming?: boolean;

    /**
     * Stream options for body parsing
     */
    streamOptions?: {
      /**
       * High water mark for streams (chunk size)
       * @default 64 * 1024 (64KB)
       */
      highWaterMark?: number;

      /**
       * Maximum size for request body
       * @default 10 * 1024 * 1024 (10MB)
       */
      maxSize?: number;
    };
  };

  /**
   * Logger configuration
   */
  logger?: {
    /**
     * Log level
     * @default 'info'
     */
    level?: 'debug' | 'info' | 'warn' | 'error';

    /**
     * Pretty print logs
     * @default false
     */
    prettyPrint?: boolean;
  };
}
```

### Methods

#### `route(options: RouteOptions): this`

Registers a route with the application.

```typescript
interface RouteOptions {
  path: string;
  method: HttpMethod;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<any> | any;
  middleware?: MiddlewareHandler[];
}

app.route({
  path: '/users',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({ users: [] });
  }
});
```

#### `use(middleware: MiddlewareHandler): this`

Adds a middleware to the application.

```typescript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
```

#### `listen(port: number, callback?: () => void): Server`

Starts the server on the specified port.

```typescript
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

#### `getWebSocketServer(): WebSocketServer | undefined`

Returns the WebSocket server instance if WebSockets are enabled, or `undefined` otherwise.

```typescript
const wsServer = app.getWebSocketServer();
if (wsServer) {
  wsServer.broadcast({ message: 'Hello' });
}
```

#### `cleanup(): void`

Releases resources used by the application, including memory resources and WebSocket connections.

```typescript
// Clean up when shutting down
process.on('SIGINT', () => {
  app.cleanup();
  process.exit(0);
});
```

## Routing

### HTTP Methods

The framework supports all standard HTTP methods through the `HttpMethod` enum:

```typescript
enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  ALL = '*'
}
```

### Route Parameters

Route parameters can be defined using the colon syntax in the path and are available in `req.params`:

```typescript
app.route({
  path: '/users/:id',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const userId = req.params.id;
    res.status(200).json({ id: userId, name: `User ${userId}` });
  }
});
```

### Query Parameters

Query parameters are automatically parsed and available in `req.query`:

```typescript
app.route({
  path: '/search',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const { term, limit } = req.query;
    res.status(200).json({ results: [], term, limit });
  }
});
```

## Request Handling

### Request Object

The request object is an extended version of Node.js's `IncomingMessage` with these additional properties:

- `params`: Object containing route parameters
- `query`: Object containing query parameters
- `body`: Parsed request body (available after parsing middleware)
- `json()`: Method to parse JSON body
- `text()`: Method to parse text body
- `formData()`: Method to parse form data
- `stream()`: Method to get request body as a stream

### Body Parsing

Parse request body using async methods:

```typescript
app.route({
  path: '/users',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    try {
      const body = await req.json();
      res.status(201).json({ id: 1, ...body });
    } catch (err) {
      res.status(400).json({ error: 'Invalid JSON' });
    }
  }
});
```

### Streaming

Process request body as a stream:

```typescript
app.route({
  path: '/upload',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    try {
      const stream = req.stream();
      // Process the stream
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
});
```

## Response Methods

### JSON Response

Send JSON response:

```typescript
res.status(200).json({ message: 'Success', data: {} });
```

### Text Response

Send text response:

```typescript
res.status(200).text('Success');
```

### HTML Response

Send HTML response:

```typescript
res.status(200).html('<h1>Hello World</h1>');
```

### Stream Response

Respond with a stream:

```typescript
res.status(200)
  .setHeader('Content-Type', 'application/octet-stream')
  .stream(fileStream);
```

### Setting Status

Set HTTP status code:

```typescript
res.status(404);
```

### Setting Headers

Set response headers:

```typescript
res.setHeader('Content-Type', 'application/json');
res.setHeader('X-Custom-Header', 'Value');
```

## Middleware

Middleware functions are functions that have access to the request object, the response object, and the next middleware function.

### Global Middleware

Apply middleware to all routes:

```typescript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
```

### Route-Specific Middleware

Apply middleware to specific routes:

```typescript
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Validate token
  next();
};

app.route({
  path: '/protected',
  method: HttpMethod.GET,
  middleware: [authMiddleware],
  handler: (req, res) => {
    res.status(200).json({ message: 'Protected resource' });
  }
});
```

### Error Handling Middleware

Handle errors in middleware chain:

```typescript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message
  });
});
```

## Error Handling

### HTTP Errors

The framework provides a set of HTTP error classes:

```typescript
import { BadRequestError, NotFoundError } from 'nexurejs';

app.route({
  path: '/users/:id',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      throw new BadRequestError('Invalid user ID');
    }

    const user = findUser(userId);
    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }

    res.status(200).json(user);
  }
});
```

Available HTTP error classes:

- `HttpError` - Base error class
- `BadRequestError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `MethodNotAllowedError` (405)
- `NotAcceptableError` (406)
- `ConflictError` (409)
- `PayloadTooLargeError` (413)
- `UnsupportedMediaTypeError` (415)
- `UnprocessableEntityError` (422)
- `TooManyRequestsError` (429)
- `InternalServerError` (500)
- `NotImplementedError` (501)
- `ServiceUnavailableError` (503)

## Streaming

The framework provides advanced streaming capabilities for handling large files and data efficiently.

### Request Streaming

```typescript
app.route({
  path: '/upload',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    const hashTransformer = new HashTransform();
    const writeStream = fs.createWriteStream('/path/to/file');

    await pipeline(
      req.stream(),
      hashTransformer,
      writeStream
    );

    res.status(200).json({
      size: hashTransformer.totalBytes,
      hash: hashTransformer.digest
    });
  }
});
```

### Response Streaming

```typescript
app.route({
  path: '/download/:filename',
  method: HttpMethod.GET,
  handler: async (req, res) => {
    const filename = req.params.filename;
    const filePath = `/path/to/${filename}`;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const readStream = fs.createReadStream(filePath);
    await pipeline(readStream, res.stream());
  }
});
```

### Transform Streams

Create custom transform streams for data processing:

```typescript
class UppercaseTransform extends Transform {
  _transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  }
}

app.route({
  path: '/transform',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    const transform = new UppercaseTransform();
    res.setHeader('Content-Type', 'text/plain');
    await pipeline(req.stream(), transform, res.stream());
  }
});
```

## Validation

The framework includes input validation capabilities:

```typescript
// Define a schema
const userSchema = {
  required: ['name', 'email', 'password'],
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 50
    },
    email: {
      type: 'string',
      format: 'email'
    },
    password: {
      type: 'string',
      minLength: 8
    }
  }
};

// Create validation middleware
const validateUser = async (req, res, next) => {
  try {
    const body = await req.json();
    const errors = validate(body, userSchema);

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors
      });
    }

    // Body is valid, store it for the handler
    req.body = body;
    next();
  } catch (err) {
    next(err);
  }
};

// Use the middleware
app.route({
  path: '/users',
  method: HttpMethod.POST,
  middleware: [validateUser],
  handler: (req, res) => {
    // Request body is already validated
    res.status(201).json({
      id: 1,
      ...req.body
    });
  }
});
```

## Native Modules

NexureJS includes native C++ modules for performance-critical operations. You can control their usage:

```typescript
// Check if native modules are being used
import { isNative, isNativeAvailable } from 'nexurejs';

console.log(`Using native implementation: ${isNative}`);
console.log(`Native implementation available: ${isNativeAvailable()}`);

// Force JavaScript fallback
import { forceJavaScriptFallback } from 'nexurejs';
forceJavaScriptFallback();

// Try to force native implementation (returns true if successful)
import { forceNativeImplementation } from 'nexurejs';
const success = forceNativeImplementation();
```

## File Operations

The framework provides utility functions for file operations:

```typescript
import {
  readFileContents,
  writeFileContents,
  ensureDirectory,
  fileExists,
  streamFile
} from 'nexurejs';

// Read file
const content = await readFileContents('/path/to/file');

// Write file
await writeFileContents('/path/to/file', 'content');

// Stream file to response
app.route({
  path: '/files/:filename',
  method: HttpMethod.GET,
  handler: async (req, res) => {
    const { filename } = req.params;
    const exists = await fileExists(`/files/${filename}`);

    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    await streamFile(`/files/${filename}`, res);
  }
});
```

## Utility Functions

The framework provides various utility functions:

### Logging

```typescript
import { logger, LogLevel } from 'nexurejs';

logger.setLevel(LogLevel.DEBUG);
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### Crypto

```typescript
import { crypto } from 'nexurejs';

// Generate hash
const hash = crypto.hash('sha256', 'data');

// Generate random string
const random = crypto.randomBytes(16).toString('hex');
```

### Buffer Pool

```typescript
import { bufferPool } from 'nexurejs';

// Get buffer from pool
const buffer = bufferPool.get(1024); // 1KB buffer

// Return buffer to pool
bufferPool.release(buffer);
```
