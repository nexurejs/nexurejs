# WebSocket Native Module

## Overview

The WebSocket module is a high-performance C++ implementation for WebSocket server functionality. It provides significantly faster WebSocket handling compared to JavaScript implementations, with support for efficient binary data transfer, message compression, and custom protocols.

## Features

- Fast WebSocket server implementation using C++ and uWebSockets
- Support for both text and binary message formats
- Per-message compression support (RFC 7692)
- Custom protocol negotiation
- Automatic ping/pong for connection health monitoring
- Connection backpressure handling
- Performance metrics tracking
- Fallback to JavaScript implementation when native module is unavailable

## API Reference

### Constructor

```typescript
constructor(options?: WebSocketOptions)
```

Creates a new instance of the WebSocket server. Automatically uses the native implementation if available, otherwise falls back to JavaScript implementation.

**Parameters:**
- `options.maxPayloadLength` - Maximum allowed message payload length (default: 16MB)
- `options.idleTimeout` - Connection idle timeout in seconds (default: 120)
- `options.compression` - Enable per-message compression (default: true)
- `options.maxBackpressure` - Maximum allowed backpressure in bytes (default: 1MB)
- `options.protocols` - Array of supported protocols (default: [])

### Methods

#### `handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void`

Handles WebSocket upgrade requests.

**Parameters:**
- `req: IncomingMessage` - HTTP request object
- `socket: Socket` - TCP socket
- `head: Buffer` - First packet of the upgraded stream

**Throws:**
- Error if the upgrade fails

#### `send(connectionId: string, message: string | Buffer, isBinary?: boolean): boolean`

Sends a message to a specific connection.

**Parameters:**
- `connectionId: string` - Connection identifier
- `message: string | Buffer` - Message to send
- `isBinary?: boolean` - Whether the message is binary (default: auto-detect)

**Returns:**
- `boolean` - True if the message was sent successfully, false if backpressure was applied

#### `broadcast(message: string | Buffer, isBinary?: boolean): void`

Broadcasts a message to all connected clients.

**Parameters:**
- `message: string | Buffer` - Message to send
- `isBinary?: boolean` - Whether the message is binary (default: auto-detect)

#### `close(connectionId: string, code?: number, reason?: string): void`

Closes a specific connection.

**Parameters:**
- `connectionId: string` - Connection identifier
- `code?: number` - Close code (default: 1000)
- `reason?: string` - Close reason (default: '')

#### `getConnections(): string[]`

Gets a list of all active connection IDs.

**Returns:**
- `string[]` - Array of connection IDs

### Events

The WebSocket server emits the following events:

- `connection` - When a new WebSocket connection is established
- `message` - When a message is received
- `close` - When a connection is closed
- `error` - When an error occurs

Example:
```typescript
websocket.on('connection', (connectionId: string, request: any) => {
  console.log(`New connection: ${connectionId}`);
});

websocket.on('message', (connectionId: string, message: Buffer, isBinary: boolean) => {
  console.log(`Received ${isBinary ? 'binary' : 'text'} message from ${connectionId}`);
});
```

### Static Methods

#### `getPerformanceMetrics(): { connections: number; messagesReceived: number; messagesSent: number; bytesReceived: number; bytesSent: number; compressionRatio: number }`

Returns performance metrics for the WebSocket server.

**Returns:**
- `connections` - Current number of active connections
- `messagesReceived` - Total number of messages received
- `messagesSent` - Total number of messages sent
- `bytesReceived` - Total bytes received
- `bytesSent` - Total bytes sent
- `compressionRatio` - Average compression ratio for compressed messages

#### `resetPerformanceMetrics(): void`

Resets all performance metrics to zero.

## Implementation Details

The WebSocket native module is implemented in C++ using the Node-API (N-API) for stable ABI compatibility across Node.js versions. The module uses the uWebSockets library for high-performance WebSocket handling.

## C++ Implementation Explained

### Core Classes and Methods

#### `WebSocketServer` Class

This is the main C++ class that handles WebSocket server functionality:

```cpp
class WebSocketServer : public Napi::ObjectWrap<WebSocketServer> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  WebSocketServer(const Napi::CallbackInfo& info);
  ~WebSocketServer();

private:
  // JavaScript-facing methods
  Napi::Value HandleUpgrade(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Broadcast(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value GetConnections(const Napi::CallbackInfo& info);

  // Event emitters
  void EmitConnection(const std::string& connectionId, const Napi::Object& request);
  void EmitMessage(const std::string& connectionId, const char* message, size_t length, bool isBinary);
  void EmitClose(const std::string& connectionId, int code, const std::string& reason);
  void EmitError(const std::string& connectionId, const std::string& error);

  // Performance metrics
  static Napi::Value GetPerformanceMetrics(const Napi::CallbackInfo& info);
  static Napi::Value ResetPerformanceMetrics(const Napi::CallbackInfo& info);

  // uWebSockets integration
  void ConfigureApp();
  void HandleWebSocketUpgrade(uWS::HttpResponse<true>* res, uWS::HttpRequest* req,
                             us_socket_context_t* context);
  std::string GenerateConnectionId();

  // Connection tracking
  struct Connection {
    uWS::WebSocket<true, true, PerSocketData>* ws;
    std::string ip;
    int port;
    std::string protocol;
    std::unordered_map<std::string, std::string> headers;
    int64_t bytesReceived;
    int64_t bytesSent;
    double compressionRatio;
  };

  std::unordered_map<std::string, Connection> connections_;

  // Server options
  struct {
    size_t maxPayloadLength;
    unsigned int idleTimeout;
    bool compression;
    size_t maxBackpressure;
    std::vector<std::string> protocols;
  } options_;

  // uWebSockets app instance
  std::unique_ptr<uWS::App> app_;

  // Node.js integration
  Napi::FunctionReference emit_;
  Napi::ThreadSafeFunction tsfn_;

  // Performance metrics storage
  static struct {
    std::atomic<int> connections;
    std::atomic<int64_t> messagesReceived;
    std::atomic<int64_t> messagesSent;
    std::atomic<int64_t> bytesReceived;
    std::atomic<int64_t> bytesSent;
    std::atomic<double> compressionRatio;
    std::atomic<int> compressionSamples;
  } metrics_;
};
```

#### `PerSocketData` Structure

Per-socket data stored with each WebSocket connection:

```cpp
struct PerSocketData {
  std::string connectionId;
  int64_t bytesReceived;
  int64_t bytesSent;
  size_t compressionOriginalSize;
  size_t compressionCompressedSize;
  int compressionSamples;
};
```

### WebSocket Initialization

The WebSocket server is initialized with configuration options:

```cpp
WebSocketServer::WebSocketServer(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<WebSocketServer>(info) {
  Napi::Env env = info.Env();

  // Default options
  options_.maxPayloadLength = 16 * 1024 * 1024; // 16MB
  options_.idleTimeout = 120;                   // 2 minutes
  options_.compression = true;
  options_.maxBackpressure = 1 * 1024 * 1024;   // 1MB

  // Parse options if provided
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("maxPayloadLength") && options.Get("maxPayloadLength").IsNumber()) {
      options_.maxPayloadLength = options.Get("maxPayloadLength").As<Napi::Number>().Uint32Value();
    }

    if (options.Has("idleTimeout") && options.Get("idleTimeout").IsNumber()) {
      options_.idleTimeout = options.Get("idleTimeout").As<Napi::Number>().Uint32Value();
    }

    if (options.Has("compression") && options.Get("compression").IsBoolean()) {
      options_.compression = options.Get("compression").As<Napi::Boolean>().Value();
    }

    if (options.Has("maxBackpressure") && options.Get("maxBackpressure").IsNumber()) {
      options_.maxBackpressure = options.Get("maxBackpressure").As<Napi::Number>().Uint32Value();
    }

    if (options.Has("protocols") && options.Get("protocols").IsArray()) {
      Napi::Array protocols = options.Get("protocols").As<Napi::Array>();
      for (uint32_t i = 0; i < protocols.Length(); i++) {
        Napi::Value protocol = protocols.Get(i);
        if (protocol.IsString()) {
          options_.protocols.push_back(protocol.As<Napi::String>().Utf8Value());
        }
      }
    }
  }

  // Store emit function for event handling
  Napi::Object thisObj = info.This().As<Napi::Object>();
  if (thisObj.Has("emit") && thisObj.Get("emit").IsFunction()) {
    emit_ = Napi::Persistent(thisObj.Get("emit").As<Napi::Function>());
  }

  // Create thread-safe function for event emission from worker threads
  tsfn_ = Napi::ThreadSafeFunction::New(
    env,
    emit_.Value(),
    "WebSocketCallback",
    0,
    1,
    []( Napi::Env ) {} // Finalizer
  );

  // Configure uWebSockets app
  ConfigureApp();
}
```

### Handling WebSocket Upgrades

The server handles HTTP-to-WebSocket protocol upgrades:

```cpp
Napi::Value WebSocketServer::HandleUpgrade(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected 3 arguments").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsObject() || !info[1].IsObject() || !info[2].IsBuffer()) {
    Napi::TypeError::New(env, "Invalid arguments").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Extract request info
  Napi::Object req = info[0].As<Napi::Object>();
  Napi::Object socket = info[1].As<Napi::Object>();
  Napi::Buffer<uint8_t> headBuffer = info[2].As<Napi::Buffer<uint8_t>>();

  // Extract socket file descriptor
  int socketFd = -1;
  if (socket.Has("_handle") && socket.Get("_handle").IsObject()) {
    Napi::Object handle = socket.Get("_handle").As<Napi::Object>();
    if (handle.Has("fd") && handle.Get("fd").IsNumber()) {
      socketFd = handle.Get("fd").As<Napi::Number>().Int32Value();
    }
  }

  if (socketFd < 0) {
    Napi::Error::New(env, "Could not extract socket file descriptor").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Extract HTTP headers
  std::unordered_map<std::string, std::string> headers;
  if (req.Has("headers") && req.Get("headers").IsObject()) {
    Napi::Object headersObj = req.Get("headers").As<Napi::Object>();
    Napi::Array headerNames = headersObj.GetPropertyNames();

    for (uint32_t i = 0; i < headerNames.Length(); i++) {
      Napi::Value key = headerNames.Get(i);
      if (key.IsString() && headersObj.Get(key).IsString()) {
        std::string headerName = key.As<Napi::String>().Utf8Value();
        std::string headerValue = headersObj.Get(key).As<Napi::String>().Utf8Value();
        headers[headerName] = headerValue;
      }
    }
  }

  // Extract client IP and port
  std::string ip = "0.0.0.0";
  int port = 0;

  if (req.Has("connection") && req.Get("connection").IsObject()) {
    Napi::Object connection = req.Get("connection").As<Napi::Object>();

    if (connection.Has("remoteAddress") && connection.Get("remoteAddress").IsString()) {
      ip = connection.Get("remoteAddress").As<Napi::String>().Utf8Value();
    }

    if (connection.Has("remotePort") && connection.Get("remotePort").IsNumber()) {
      port = connection.Get("remotePort").As<Napi::Number>().Int32Value();
    }
  }

  // Extract WebSocket protocols
  std::string requestedProtocols;
  if (headers.find("sec-websocket-protocol") != headers.end()) {
    requestedProtocols = headers["sec-websocket-protocol"];
  }

  // Negotiate protocol
  std::string selectedProtocol;
  if (!requestedProtocols.empty() && !options_.protocols.empty()) {
    std::vector<std::string> protocols = SplitString(requestedProtocols, ',');

    for (const auto& protocol : protocols) {
      std::string trimmedProtocol = TrimString(protocol);

      if (std::find(options_.protocols.begin(), options_.protocols.end(), trimmedProtocol)
          != options_.protocols.end()) {
        selectedProtocol = trimmedProtocol;
        break;
      }
    }
  }

  // Generate connection ID
  std::string connectionId = GenerateConnectionId();

  // Perform upgrade
  us_socket_t* nativeSocket = app_->getNativeSocket(socketFd);
  if (!nativeSocket) {
    Napi::Error::New(env, "Failed to get native socket").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Perform WebSocket handshake
  us_socket_context_t* socketContext = us_socket_context(nativeSocket);

  // Create a fake HTTP response for upgrade handling
  uWS::HttpResponse<true>* res = (uWS::HttpResponse<true>*) malloc(sizeof(uWS::HttpResponse<true>));
  new (res) uWS::HttpResponse<true>(nativeSocket);

  // Create a fake HTTP request for upgrade handling
  uWS::HttpRequest* upgradeReq = (uWS::HttpRequest*) malloc(sizeof(uWS::HttpRequest));
  new (upgradeReq) uWS::HttpRequest();

  // Set up request data
  upgradeReq->setUrl(req.Has("url") && req.Get("url").IsString() ?
                    req.Get("url").As<Napi::String>().Utf8Value() : "/");

  for (const auto& header : headers) {
    upgradeReq->setHeader(header.first.c_str(), header.second.c_str());
  }

  // Store connection data for later reference
  Connection connection;
  connection.ip = ip;
  connection.port = port;
  connection.protocol = selectedProtocol;
  connection.headers = headers;
  connection.bytesReceived = 0;
  connection.bytesSent = 0;
  connection.compressionRatio = 0.0;

  connections_[connectionId] = connection;

  // Pass to uWebSockets for completion of handshake
  HandleWebSocketUpgrade(res, upgradeReq, socketContext);

  return env.Undefined();
}
```

### WebSocket Configuration and Behavior

The WebSocket server is configured with behaviors for different events:

```cpp
void WebSocketServer::ConfigureApp() {
  // Create uWebSockets app
  app_ = std::make_unique<uWS::App>();

  // Configure WebSocket behavior
  auto ws_behavior = uWS::WebSocketBehavior<PerSocketData>();

  // Set options
  ws_behavior.maxPayloadLength = options_.maxPayloadLength;
  ws_behavior.idleTimeout = options_.idleTimeout;
  ws_behavior.compression = options_.compression ?
    uWS::SHARED_COMPRESSOR : uWS::DISABLED;
  ws_behavior.maxBackpressure = options_.maxBackpressure;

  // Connection opened handler
  ws_behavior.open = [this](auto* ws, auto* req) {
    // Initialize per-socket data
    PerSocketData* data = (PerSocketData*)ws->getUserData();
    data->connectionId = req->getHeader("x-connection-id").toString();
    data->bytesReceived = 0;
    data->bytesSent = 0;
    data->compressionOriginalSize = 0;
    data->compressionCompressedSize = 0;
    data->compressionSamples = 0;

    // Store WebSocket pointer in connections map
    if (connections_.find(data->connectionId) != connections_.end()) {
      connections_[data->connectionId].ws = ws;

      // Update metrics
      metrics_.connections++;

      // Convert request object to JavaScript object for the 'connection' event
      Napi::Object requestObj = ConvertRequestToJSObject(req);

      // Emit connection event
      EmitConnection(data->connectionId, requestObj);
    }
  };

  // Message handler
  ws_behavior.message = [this](auto* ws, std::string_view message, uWS::OpCode opCode) {
    PerSocketData* data = (PerSocketData*)ws->getUserData();

    // Update metrics
    data->bytesReceived += message.length();
    metrics_.bytesReceived += message.length();
    metrics_.messagesReceived++;

    // Update compression statistics
    size_t compressedSize = message.length();
    size_t originalSize = compressedSize;

    if (options_.compression) {
      // Get original (uncompressed) size from uWebSockets
      originalSize = ws->getOriginalMessageSize(message);

      if (originalSize > compressedSize) {
        data->compressionOriginalSize += originalSize;
        data->compressionCompressedSize += compressedSize;
        data->compressionSamples++;

        // Update global compression metrics
        if (originalSize > 0) {
          metrics_.compressionRatio = ((double)metrics_.compressionRatio * metrics_.compressionSamples +
                                     (1.0 - (double)compressedSize / originalSize)) /
                                     (metrics_.compressionSamples + 1);
          metrics_.compressionSamples++;
        }
      }
    }

    // Update connection-specific metrics
    Connection& connection = connections_[data->connectionId];
    connection.bytesReceived += message.length();

    if (data->compressionSamples > 0) {
      connection.compressionRatio = 1.0 - (double)data->compressionCompressedSize /
                                    data->compressionOriginalSize;
    }

    // Emit message event
    bool isBinary = (opCode == uWS::BINARY);
    EmitMessage(data->connectionId, message.data(), message.length(), isBinary);
  };

  // Close handler
  ws_behavior.close = [this](auto* ws, int code, std::string_view reason) {
    PerSocketData* data = (PerSocketData*)ws->getUserData();

    // Update metrics
    metrics_.connections--;

    // Emit close event
    EmitClose(data->connectionId, code, std::string(reason));

    // Remove from connections map
    connections_.erase(data->connectionId);
  };

  // WebSocket route handler
  app_->ws<PerSocketData>("/*", std::move(ws_behavior));
}
```

### Message Sending Implementation

The WebSocket implementation efficiently handles sending messages to clients:

```cpp
Napi::Value WebSocketServer::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected at least 2 arguments").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString() || (!info[1].IsString() && !info[1].IsBuffer())) {
    Napi::TypeError::New(env, "Invalid arguments").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Extract arguments
  std::string connectionId = info[0].As<Napi::String>().Utf8Value();
  bool isBinary = false;

  if (info.Length() >= 3 && info[2].IsBoolean()) {
    isBinary = info[2].As<Napi::Boolean>().Value();
  } else {
    // Auto-detect binary based on message type
    isBinary = info[1].IsBuffer();
  }

  // Find connection
  auto it = connections_.find(connectionId);
  if (it == connections_.end()) {
    return Napi::Boolean::New(env, false);
  }

  // Get WebSocket
  uWS::WebSocket<true, true, PerSocketData>* ws = it->second.ws;

  // Prepare message
  std::string_view message;
  std::string stringMessage;

  if (info[1].IsBuffer()) {
    Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();
    message = std::string_view((char*)buffer.Data(), buffer.Length());
  } else {
    stringMessage = info[1].As<Napi::String>().Utf8Value();
    message = std::string_view(stringMessage);
  }

  // Send message
  bool ok = ws->send(message, isBinary ? uWS::BINARY : uWS::TEXT);

  // Update metrics if sent successfully
  if (ok) {
    PerSocketData* data = (PerSocketData*)ws->getUserData();
    data->bytesSent += message.length();

    metrics_.bytesSent += message.length();
    metrics_.messagesSent++;

    it->second.bytesSent += message.length();
  }

  return Napi::Boolean::New(env, ok);
}
```

### Broadcasting Implementation

The WebSocket server can efficiently broadcast messages to all clients:

```cpp
Napi::Value WebSocketServer::Broadcast(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected at least 1 argument").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString() && !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Message must be a string or buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Extract arguments
  bool isBinary = false;

  if (info.Length() >= 2 && info[1].IsBoolean()) {
    isBinary = info[1].As<Napi::Boolean>().Value();
  } else {
    // Auto-detect binary based on message type
    isBinary = info[0].IsBuffer();
  }

  // Prepare message
  std::string_view message;
  std::string stringMessage;

  if (info[0].IsBuffer()) {
    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    message = std::string_view((char*)buffer.Data(), buffer.Length());
  } else {
    stringMessage = info[0].As<Napi::String>().Utf8Value();
    message = std::string_view(stringMessage);
  }

  // Store message size for metrics
  size_t messageSize = message.length();

  // Broadcast using uWebSockets API
  app_->publish("broadcast", message, isBinary ? uWS::BINARY : uWS::TEXT);

  // Update metrics
  int connectionCount = metrics_.connections.load();
  metrics_.bytesSent += messageSize * connectionCount;
  metrics_.messagesSent += connectionCount;

  return env.Undefined();
}
```

### Memory Management

The WebSocket implementation uses efficient memory management techniques:

1. **RAII for Resources**: The implementation uses RAII (Resource Acquisition Is Initialization) pattern for resource management:

```cpp
// Unique pointer for automatic cleanup
std::unique_ptr<uWS::App> app_;
```

2. **Zero-copy Message Handling**: The implementation avoids unnecessary copies of message data:

```cpp
// Use string_view for zero-copy message handling
std::string_view message;
ws->send(message, opCode);
```

3. **Connection Cleanup**: Connections are properly cleaned up on close:

```cpp
// Remove from connections map when closed
connections_.erase(data->connectionId);
```

4. **Thread-safety**: The implementation ensures thread-safety for asynchronous operations:

```cpp
// Thread-safe function for event callbacks
tsfn_ = Napi::ThreadSafeFunction::New(/*...*/);

// Atomic variables for metrics
static struct {
  std::atomic<int> connections;
  std::atomic<int64_t> messagesReceived;
  // ...
} metrics_;
```

### N-API Integration

The WebSocket server integrates with Node.js using N-API:

```cpp
// Initialize and export the WebSocketServer class
Napi::Object WebSocketServer::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "WebSocketServer", {
    InstanceMethod("handleUpgrade", &WebSocketServer::HandleUpgrade),
    InstanceMethod("send", &WebSocketServer::Send),
    InstanceMethod("broadcast", &WebSocketServer::Broadcast),
    InstanceMethod("close", &WebSocketServer::Close),
    InstanceMethod("getConnections", &WebSocketServer::GetConnections),
    StaticMethod("getPerformanceMetrics", &WebSocketServer::GetPerformanceMetrics),
    StaticMethod("resetPerformanceMetrics", &WebSocketServer::ResetPerformanceMetrics)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("WebSocketServer", func);
  return exports;
}

// Emit events to JavaScript
void WebSocketServer::EmitConnection(const std::string& connectionId, const Napi::Object& request) {
  if (!emit_.IsEmpty()) {
    // Use thread-safe function to call back to JavaScript
    tsfn_.BlockingCall([connectionId, request](Napi::Env env, Napi::Function emit) {
      emit.Call({
        Napi::String::New(env, "connection"),
        Napi::String::New(env, connectionId),
        request
      });
    });
  }
}

// Convert native metrics to JavaScript object
Napi::Value WebSocketServer::GetPerformanceMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);

  result.Set("connections", Napi::Number::New(env, metrics_.connections.load()));
  result.Set("messagesReceived", Napi::Number::New(env, metrics_.messagesReceived.load()));
  result.Set("messagesSent", Napi::Number::New(env, metrics_.messagesSent.load()));
  result.Set("bytesReceived", Napi::Number::New(env, metrics_.bytesReceived.load()));
  result.Set("bytesSent", Napi::Number::New(env, metrics_.bytesSent.load()));
  result.Set("compressionRatio", Napi::Number::New(env, metrics_.compressionRatio.load()));

  return result;
}
```

### Performance Optimizations

The WebSocket implementation includes several performance optimizations:

1. **Message Compression**: The implementation uses per-message compression to reduce bandwidth:

```cpp
// Enable compression based on options
ws_behavior.compression = options_.compression ?
  uWS::SHARED_COMPRESSOR : uWS::DISABLED;
```

2. **Backpressure Handling**: The server manages backpressure to prevent memory issues with slow clients:

```cpp
// Set maximum backpressure
ws_behavior.maxBackpressure = options_.maxBackpressure;

// Check if send was successful or backpressured
bool ok = ws->send(message, opCode);
```

3. **Efficient Broadcasting**: Messages are broadcasted efficiently to all clients:

```cpp
// Efficient broadcast implementation
app_->publish("broadcast", message, opCode);
```

4. **Zero-copy Buffer Handling**: The implementation avoids unnecessary buffer copies:

```cpp
// Direct buffer access for zero-copy
Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();
message = std::string_view((char*)buffer.Data(), buffer.Length());
```

5. **Asynchronous Event Handling**: Events are processed asynchronously to avoid blocking:

```cpp
// Asynchronous event emission
tsfn_.BlockingCall([connectionId, message, length, isBinary](Napi::Env env, Napi::Function emit) {
  emit.Call({
    Napi::String::New(env, "message"),
    Napi::String::New(env, connectionId),
    Napi::Buffer<char>::Copy(env, message, length),
    Napi::Boolean::New(env, isBinary)
  });
});
```

## Performance Considerations

- The native implementation is significantly faster than JavaScript-based WebSocket servers, especially for applications with many concurrent connections
- Message compression can substantially reduce bandwidth usage but adds some CPU overhead
- For optimal performance, consider the following:
  - Use binary messages for structured data to avoid JSON serialization/deserialization costs
  - Tune the `maxPayloadLength` and `maxBackpressure` settings based on your application needs
  - Monitor the `getPerformanceMetrics()` to identify potential bottlenecks

## Examples

### Basic WebSocket Server

```typescript
import { WebSocketServer } from 'nexurejs';
import { createServer } from 'http';

// Create HTTP server
const server = createServer();

// Create WebSocket server
const wss = new WebSocketServer({
  maxPayloadLength: 1024 * 1024, // 1MB
  compression: true
});

// Handle connections
wss.on('connection', (connectionId, request) => {
  console.log(`New connection: ${connectionId}`);

  // Send welcome message
  wss.send(connectionId, 'Welcome to the WebSocket server!');
});

// Handle messages
wss.on('message', (connectionId, message, isBinary) => {
  // Echo the message back
  wss.send(connectionId, message, isBinary);
});

// Handle close
wss.on('close', (connectionId, code, reason) => {
  console.log(`Connection ${connectionId} closed: ${code} ${reason}`);
});

// Start server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head);
});

server.listen(8080, () => {
  console.log('WebSocket server listening on port 8080');
});
```

### Chat Application

```typescript
import { WebSocketServer } from 'nexurejs';
import { createServer } from 'http';
import * as fs from 'fs';

// Create HTTP server
const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream('index.html').pipe(res);
  }
});

// Create WebSocket server with custom protocol
const wss = new WebSocketServer({
  protocols: ['chat']
});

// Keep track of users
const users = new Map();

// Handle connections
wss.on('connection', (connectionId, request) => {
  // Add to users with a random name
  const username = `User${Math.floor(Math.random() * 1000)}`;
  users.set(connectionId, { username });

  // Send welcome message
  wss.send(connectionId, JSON.stringify({
    type: 'welcome',
    id: connectionId,
    username
  }));

  // Broadcast new user joined
  wss.broadcast(JSON.stringify({
    type: 'userJoined',
    username,
    timestamp: Date.now()
  }));
});

// Handle messages
wss.on('message', (connectionId, data, isBinary) => {
  if (!isBinary) {
    try {
      const message = JSON.parse(data.toString());
      const user = users.get(connectionId);

      if (message.type === 'chat') {
        // Broadcast chat message to all clients
        wss.broadcast(JSON.stringify({
          type: 'chat',
          username: user.username,
          message: message.text,
          timestamp: Date.now()
        }));
      } else if (message.type === 'updateUsername') {
        // Update username
        const oldUsername = user.username;
        const newUsername = message.username;
        user.username = newUsername;

        // Broadcast username change
        wss.broadcast(JSON.stringify({
          type: 'usernameChanged',
          oldUsername,
          newUsername,
          timestamp: Date.now()
        }));
      }
    } catch (err) {
      console.error('Invalid message format', err);
    }
  }
});

// Handle close
wss.on('close', (connectionId) => {
  const user = users.get(connectionId);
  if (user) {
    // Broadcast user left
    wss.broadcast(JSON.stringify({
      type: 'userLeft',
      username: user.username,
      timestamp: Date.now()
    }));

    // Remove user
    users.delete(connectionId);
  }
});

// Start server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head);
});

server.listen(8080, () => {
  console.log('Chat server listening on port 8080');
});
```

### Performance Monitoring

```typescript
import { WebSocketServer } from 'nexurejs';
import { createServer } from 'http';

// Create WebSocket server
const wss = new WebSocketServer();

// Display performance metrics every 5 seconds
setInterval(() => {
  const metrics = WebSocketServer.getPerformanceMetrics();

  console.log('WebSocket Performance Metrics:');
  console.log(`- Active connections: ${metrics.connections}`);
  console.log(`- Messages received: ${metrics.messagesReceived}`);
  console.log(`- Messages sent: ${metrics.messagesSent}`);
  console.log(`- Bytes received: ${formatBytes(metrics.bytesReceived)}`);
  console.log(`- Bytes sent: ${formatBytes(metrics.bytesSent)}`);
  console.log(`- Compression ratio: ${(metrics.compressionRatio * 100).toFixed(2)}%`);
}, 5000);

// Format bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Create HTTP server
const server = createServer();

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head);
});

// Start server
server.listen(8080, () => {
  console.log('WebSocket server with performance monitoring started on port 8080');
});
```
