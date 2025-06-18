#include <napi.h>
#include <uv.h>
#include <unordered_map>
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <queue>
#include <algorithm>
#include <chrono>
#include <atomic>
#include "websocket.h"

// WebSocket frame opcodes
#define WS_CONTINUATION 0x0
#define WS_TEXT 0x1
#define WS_BINARY 0x2
#define WS_CLOSE 0x8
#define WS_PING 0x9
#define WS_PONG 0xA

// Forward declarations
class WebSocketConnection;
class WebSocketRoom;
class WebSocketServer;

// WebSocket connection class
class WebSocketConnection {
public:
    WebSocketConnection(uv_tcp_t* client, WebSocketServer* server);
    ~WebSocketConnection();

    void Send(const std::string& message);
    void SendBinary(const void* data, size_t length);
    void Close(uint16_t code = 1000, const std::string& reason = "");
    void JoinRoom(const std::string& roomName);
    void LeaveRoom(const std::string& roomName);
    void LeaveAllRooms();
    bool IsInRoom(const std::string& roomName) const;
    std::vector<std::string> GetRooms() const;
    void Ping();

    // Getters
    uint64_t GetId() const { return id_; }
    bool IsAlive() const { return isAlive_; }
    bool IsAuthenticated() const { return isAuthenticated_; }
    uint64_t GetLastActivity() const { return lastActivity_; }
    size_t GetBytesSent() const { return bytesSent_; }
    size_t GetBytesReceived() const { return bytesReceived_; }
    std::chrono::steady_clock::time_point GetConnectTime() const { return connectTime_; }

    // Setters
    void SetAlive(bool alive) { isAlive_ = alive; }
    void SetAuthenticated(bool authenticated) { isAuthenticated_ = authenticated; }
    void SetData(const std::string& key, const Napi::Value& value);
    Napi::Value GetData(const std::string& key, Napi::Env env) const;
    void UpdateActivity() {
        lastActivity_ = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
    }

private:
    static void AllocBuffer(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
    static void OnRead(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
    static void OnClose(uv_handle_t* handle);
    static void AfterWrite(uv_write_t* req, int status);

    void HandleFrame(const uint8_t* frame, size_t length);
    void HandleMessage(const std::string& message);
    void HandleBinaryMessage(const void* data, size_t length);
    void HandlePing(const void* data, size_t length);
    void HandlePong();
    void HandleClose(uint16_t code, const std::string& reason);
    void SendFrame(uint8_t opcode, const void* data, size_t length, bool mask = false);

    uint64_t id_;
    uv_tcp_t* client_;
    WebSocketServer* server_;
    bool isAlive_;
    bool isAuthenticated_ = false;
    std::vector<std::string> rooms_;
    std::unordered_map<std::string, Napi::Reference<Napi::Value>> userData_;
    mutable std::mutex mutex_;
    uint64_t lastActivity_;
    size_t bytesSent_ = 0;
    size_t bytesReceived_ = 0;
    std::chrono::steady_clock::time_point connectTime_;
};

// WebSocket room class
class WebSocketRoom {
public:
    WebSocketRoom(const std::string& name);
    ~WebSocketRoom();

    void AddConnection(WebSocketConnection* connection);
    void RemoveConnection(WebSocketConnection* connection);
    void Broadcast(const std::string& message, WebSocketConnection* exclude = nullptr);
    void BroadcastBinary(const void* data, size_t length, WebSocketConnection* exclude = nullptr);
    size_t GetConnectionCount() const;
    std::vector<WebSocketConnection*> GetConnections() const;
    std::vector<WebSocketConnection*> GetAuthenticatedConnections() const;
    void StoreMessage(const std::string& message, size_t maxHistory = 100);
    std::vector<std::string> GetMessageHistory() const;

    // Getters
    std::string GetName() const { return name_; }
    size_t GetMaxSize() const { return maxSize_; }

    // Setters
    void SetMaxSize(size_t size) { maxSize_ = size; }

private:
    std::string name_;
    std::vector<WebSocketConnection*> connections_;
    mutable std::mutex mutex_;
    std::deque<std::string> messageHistory_;
    size_t maxSize_ = 0; // 0 means unlimited
};

// WebSocket server class
class WebSocketServer : public Napi::ObjectWrap<WebSocketServer> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    WebSocketServer(const Napi::CallbackInfo& info);
    ~WebSocketServer();

    // JavaScript accessible methods
    void Start(const Napi::CallbackInfo& info);
    void Stop(const Napi::CallbackInfo& info);
    void Send(const Napi::CallbackInfo& info);
    void SendBinary(const Napi::CallbackInfo& info);
    void Broadcast(const Napi::CallbackInfo& info);
    void BroadcastBinary(const Napi::CallbackInfo& info);
    void CloseConnection(const Napi::CallbackInfo& info);
    void JoinRoom(const Napi::CallbackInfo& info);
    void LeaveRoom(const Napi::CallbackInfo& info);
    void LeaveAllRooms(const Napi::CallbackInfo& info);
    Napi::Value IsInRoom(const Napi::CallbackInfo& info);
    Napi::Value GetConnectionRooms(const Napi::CallbackInfo& info);
    Napi::Value GetRooms(const Napi::CallbackInfo& info);
    Napi::Value GetRoomSize(const Napi::CallbackInfo& info);
    Napi::Value GetRoomConnections(const Napi::CallbackInfo& info);
    Napi::Value GetConnectionCount(const Napi::CallbackInfo& info);
    void BroadcastToRoom(const Napi::CallbackInfo& info);
    void BroadcastBinaryToRoom(const Napi::CallbackInfo& info);
    void Ping(const Napi::CallbackInfo& info);
    Napi::Value GetRoomHistory(const Napi::CallbackInfo& info);
    void SetMaxRoomSize(const Napi::CallbackInfo& info);
    void SetMaxConnections(const Napi::CallbackInfo& info);
    void SetAuthenticated(const Napi::CallbackInfo& info);
    Napi::Value GetConnectionStats(const Napi::CallbackInfo& info);
    void DisconnectInactiveConnections(const Napi::CallbackInfo& info);
    void Cleanup(const Napi::CallbackInfo& info);
    Napi::Value On(const Napi::CallbackInfo& info);

    // Internal methods
    void OnConnection(uv_stream_t* server, int status);
    void OnMessage(WebSocketConnection* connection, const std::string& message);
    void OnBinaryMessage(WebSocketConnection* connection, const void* data, size_t length);
    void OnDisconnect(WebSocketConnection* connection, uint16_t code, const std::string& reason);
    void OnRoomJoin(WebSocketConnection* connection, const std::string& roomName);
    void OnRoomLeave(WebSocketConnection* connection, const std::string& roomName);
    void OnPing(WebSocketConnection* connection);
    void OnPong(WebSocketConnection* connection);
    void OnError(const std::string& error);

    // Helper methods
    void CloseConnectionById(uint64_t id, int code, const std::string& reason);

private:
    // Callback references
    Napi::FunctionReference onConnectionCallback_;
    Napi::FunctionReference onMessageCallback_;
    Napi::FunctionReference onBinaryMessageCallback_;
    Napi::FunctionReference onDisconnectCallback_;
    Napi::FunctionReference onErrorCallback_;
    Napi::FunctionReference onRoomJoinCallback_;
    Napi::FunctionReference onRoomLeaveCallback_;
    Napi::FunctionReference onPingCallback_;
    Napi::FunctionReference onPongCallback_;

    // Server state
    uv_tcp_t server_;
    std::unordered_map<uint64_t, std::unique_ptr<WebSocketConnection>> connections_;
    std::unordered_map<std::string, std::unique_ptr<WebSocketRoom>> rooms_;
    std::mutex mutex_;
    bool isRunning_ = false;
    std::atomic<size_t> maxConnections_;

    // Helper methods
    WebSocketConnection* GetConnection(uint64_t id);
    WebSocketRoom* GetRoom(const std::string& name, bool create = true);
};

// Helper to convert C++ types to JavaScript
inline Napi::Value ToValue(Napi::Env env, const std::string& value) {
    return Napi::String::New(env, value);
}

inline Napi::Value ToValue(Napi::Env env, int value) {
    return Napi::Number::New(env, value);
}

inline Napi::Value ToValue(Napi::Env env, uint64_t value) {
    return Napi::Number::New(env, static_cast<double>(value));
}

inline Napi::Value ToValue(Napi::Env env, bool value) {
    return Napi::Boolean::New(env, value);
}

template <typename T>
inline Napi::Value ToValue(Napi::Env env, const std::vector<T>& values) {
    Napi::Array array = Napi::Array::New(env, values.size());
    for (size_t i = 0; i < values.size(); i++) {
        array[i] = ToValue(env, values[i]);
    }
    return array;
}

// Implementation of the WebSocketConnection class
WebSocketConnection::WebSocketConnection(uv_tcp_t* client, WebSocketServer* server)
    : client_(client),
      server_(server),
      isAlive_(true),
      isAuthenticated_(false),
      lastActivity_(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count()),
      bytesSent_(0),
      bytesReceived_(0),
      connectTime_(std::chrono::steady_clock::now()) {
    // Generate a unique ID for this connection
    static std::atomic<uint64_t> nextId(1);
    id_ = nextId++;

    // Store the connection in the client data
    client_->data = this;

    // Set up the read callback
    uv_read_start(reinterpret_cast<uv_stream_t*>(client_), AllocBuffer, OnRead);
}

// Implementation of WebSocketConnection::AllocBuffer
void WebSocketConnection::AllocBuffer(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
    // Create a buffer with the suggested size
    *buf = uv_buf_init(new char[suggested_size], suggested_size);
}

// Implementation of WebSocketConnection::OnRead
void WebSocketConnection::OnRead(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
    WebSocketConnection* connection = static_cast<WebSocketConnection*>(stream->data);

    if (nread < 0) {
        // Error or EOF
        if (buf->base) {
            delete[] buf->base;
        }

        // Close the connection on error
        if (nread != UV_EOF) {
            connection->Close(1002, "Protocol error");
        } else {
            connection->Close(1000, "Connection closed by client");
        }

        return;
    }

    if (nread == 0) {
        // Empty read
        if (buf->base) {
            delete[] buf->base;
        }
        return;
    }

    // Update bytes received
    connection->bytesReceived_ += nread;

    // Update last activity time
    connection->UpdateActivity();

    // Handle the received data
    connection->HandleFrame(reinterpret_cast<const uint8_t*>(buf->base), nread);

    // Clean up the buffer
    if (buf->base) {
        delete[] buf->base;
    }
}

// Implementation of WebSocketConnection::OnClose
void WebSocketConnection::OnClose(uv_handle_t* handle) {
    // Free handle memory
    auto* client = reinterpret_cast<uv_tcp_t*>(handle);
    if (client) {
        delete client;
    }
}

// Implementation of WebSocketConnection::AfterWrite
void WebSocketConnection::AfterWrite(uv_write_t* req, int status) {
    // Free the request and buffer
    if (req) {
        if (req->data) {
            delete[] static_cast<char*>(req->data);
        }
        delete req;
    }
}

// Implementation of WebSocketConnection::SendFrame
void WebSocketConnection::SendFrame(uint8_t opcode, const void* data, size_t length, bool mask) {
    if (!client_ || !client_->data) {
        return;  // Connection already closed
    }

    // Calculate header size
    size_t header_size = 2;  // Base header size
    if (length > 125 && length <= 65535) {
        header_size += 2;  // 16-bit length
    } else if (length > 65535) {
        header_size += 8;  // 64-bit length
    }

    // Create buffer for header and data
    char* buffer = new char[header_size + length];

    // Set up basic header
    buffer[0] = 0x80 | opcode;  // FIN bit set, with opcode

    // Set length field
    if (length <= 125) {
        buffer[1] = static_cast<uint8_t>(length);
    } else if (length <= 65535) {
        buffer[1] = 126;
        buffer[2] = static_cast<uint8_t>((length >> 8) & 0xFF);
        buffer[3] = static_cast<uint8_t>(length & 0xFF);
    } else {
        buffer[1] = 127;
        for (int i = 0; i < 8; i++) {
            buffer[2 + i] = static_cast<uint8_t>((length >> ((7 - i) * 8)) & 0xFF);
        }
    }

    if (mask) {
        buffer[1] |= 0x80;  // Set mask bit
    }

    // Copy data to the buffer
    if (length > 0 && data != nullptr) {
        memcpy(buffer + header_size, data, length);
    }

    // Create write request
    uv_write_t* req = new uv_write_t();
    req->data = buffer;  // Store buffer pointer to free it later

    // Create buffer for libuv
    uv_buf_t uv_buf = uv_buf_init(buffer, header_size + length);

    // Write to the stream
    uv_write(req, reinterpret_cast<uv_stream_t*>(client_), &uv_buf, 1, AfterWrite);

    // Update bytes sent
    bytesSent_ += (header_size + length);
}

// Implementation of WebSocketConnection::Send
void WebSocketConnection::Send(const std::string& message) {
    if (!client_ || !client_->data) {
        return;  // Connection already closed
    }

    SendFrame(WS_TEXT, message.c_str(), message.length(), false);
}

// Implementation of WebSocketConnection::SendBinary
void WebSocketConnection::SendBinary(const void* data, size_t length) {
    if (!client_ || !client_->data) {
        return;  // Connection already closed
    }

    SendFrame(WS_BINARY, data, length, false);
}

// Implementation of WebSocketConnection::Close
void WebSocketConnection::Close(uint16_t code, const std::string& reason) {
    if (!client_ || !client_->data) {
        return;  // Already closed
    }

    // Create close frame data
    size_t data_length = 2 + reason.length();
    char* data = new char[data_length];

    // Add status code (in network byte order)
    data[0] = static_cast<char>((code >> 8) & 0xFF);
    data[1] = static_cast<char>(code & 0xFF);

    // Add reason string
    if (!reason.empty()) {
        memcpy(data + 2, reason.c_str(), reason.length());
    }

    // Send close frame
    SendFrame(WS_CLOSE, data, data_length, false);

    // Clean up
    delete[] data;

    // Close the connection
    uv_close(reinterpret_cast<uv_handle_t*>(client_), OnClose);
    client_ = nullptr;
    isAlive_ = false;
}

// Implementation of WebSocketConnection::HandleFrame
void WebSocketConnection::HandleFrame(const uint8_t* frame, size_t length) {
    if (length < 2) {
        // Frame too short
        return;
    }

    // Parse basic header
    uint8_t opcode = frame[0] & 0x0F;
    bool is_masked = (frame[1] & 0x80) != 0;
    uint64_t payload_length = frame[1] & 0x7F;

    // Handle extended payload length
    size_t header_length = 2;
    if (payload_length == 126) {
        if (length < 4) return;  // Frame too short
        payload_length = (static_cast<uint64_t>(frame[2]) << 8) | frame[3];
        header_length = 4;
    } else if (payload_length == 127) {
        if (length < 10) return;  // Frame too short
        payload_length = 0;
        for (int i = 0; i < 8; i++) {
            payload_length = (payload_length << 8) | frame[2 + i];
        }
        header_length = 10;
    }

    // Handle masking
    uint8_t mask_key[4] = {0};
    if (is_masked) {
        if (length < header_length + 4) return;  // Frame too short
        memcpy(mask_key, frame + header_length, 4);
        header_length += 4;
    }

    // Verify we have complete payload
    if (length < header_length + payload_length) {
        // Incomplete frame
        return;
    }

    // Get payload data
    const uint8_t* payload_data = frame + header_length;

    // Unmask data if needed
    std::vector<uint8_t> unmasked_data;
    if (is_masked) {
        unmasked_data.resize(payload_length);
        for (size_t i = 0; i < payload_length; i++) {
            unmasked_data[i] = payload_data[i] ^ mask_key[i % 4];
        }
        payload_data = unmasked_data.data();
    }

    // Handle based on opcode
    switch (opcode) {
        case WS_TEXT:
            {
                // Handle text message
                std::string message(reinterpret_cast<const char*>(payload_data), payload_length);
                HandleMessage(message);
            }
            break;
        case WS_BINARY:
            // Handle binary message
            HandleBinaryMessage(payload_data, payload_length);
            break;
        case WS_PING:
            // Handle ping
            HandlePing(payload_data, payload_length);
            break;
        case WS_PONG:
            // Handle pong
            HandlePong();
            break;
        case WS_CLOSE:
            {
                // Handle close
                uint16_t code = 1000;
                std::string reason;

                if (payload_length >= 2) {
                    code = (static_cast<uint16_t>(payload_data[0]) << 8) | payload_data[1];
                    if (payload_length > 2) {
                        reason = std::string(reinterpret_cast<const char*>(payload_data + 2), payload_length - 2);
                    }
                }

                HandleClose(code, reason);
            }
            break;
    }
}

// Implementation of WebSocketConnection::HandleMessage
void WebSocketConnection::HandleMessage(const std::string& message) {
    // Forward to server
    server_->OnMessage(this, message);
}

// Implementation of WebSocketConnection::HandleBinaryMessage
void WebSocketConnection::HandleBinaryMessage(const void* data, size_t length) {
    // Forward to server
    server_->OnBinaryMessage(this, data, length);
}

// Implementation of WebSocketConnection::HandlePing
void WebSocketConnection::HandlePing(const void* data, size_t length) {
    // Send pong with the same data
    SendFrame(WS_PONG, data, length, false);

    // Notify server
    server_->OnPing(this);
}

// Implementation of WebSocketConnection::HandlePong
void WebSocketConnection::HandlePong() {
    // Update alive status
    isAlive_ = true;

    // Notify server
    server_->OnPong(this);
}

// Implementation of WebSocketConnection::HandleClose
void WebSocketConnection::HandleClose(uint16_t code, const std::string& reason) {
    // Send close frame as acknowledgment if we haven't already closed
    if (client_ && client_->data) {
        Close(code, reason);
    }

    // Notify server
    server_->OnDisconnect(this, code, reason);
}

// Implementation of JoinRoom, LeaveRoom, etc.
void WebSocketConnection::JoinRoom(const std::string& roomName) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Check if already in room
    if (std::find(rooms_.begin(), rooms_.end(), roomName) != rooms_.end()) {
        return;  // Already in this room
    }

    rooms_.push_back(roomName);
}

// Implementation of WebSocketConnection::LeaveRoom
void WebSocketConnection::LeaveRoom(const std::string& roomName) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = std::find(rooms_.begin(), rooms_.end(), roomName);
    if (it != rooms_.end()) {
        rooms_.erase(it);
    }
}

void WebSocketConnection::LeaveAllRooms() {
    std::lock_guard<std::mutex> lock(mutex_);
    rooms_.clear();
}

bool WebSocketConnection::IsInRoom(const std::string& roomName) const {
    // Use a copy to avoid thread issues
    std::vector<std::string> roomsCopy;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        roomsCopy = rooms_;
    }
    return std::find(roomsCopy.begin(), roomsCopy.end(), roomName) != roomsCopy.end();
}

std::vector<std::string> WebSocketConnection::GetRooms() const {
    std::vector<std::string> roomsCopy;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        roomsCopy = rooms_;
    }
    return roomsCopy;
}

WebSocketRoom::WebSocketRoom(const std::string& name)
    : name_(name), maxSize_(0) {
}

WebSocketRoom::~WebSocketRoom() {
}

// Add a connection to the room
void WebSocketRoom::AddConnection(WebSocketConnection* connection) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Check if the connection is already in the room
    if (std::find(connections_.begin(), connections_.end(), connection) != connections_.end()) {
        return;  // Already in the room
    }

    // Check if the room is at capacity
    if (maxSize_ > 0 && connections_.size() >= maxSize_) {
        // Room is full, remove the oldest connection to make space
        connections_.erase(connections_.begin());
    }

    connections_.push_back(connection);
}

// Remove a connection from the room
void WebSocketRoom::RemoveConnection(WebSocketConnection* connection) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = std::find(connections_.begin(), connections_.end(), connection);
    if (it != connections_.end()) {
        connections_.erase(it);
    }
}

// Broadcast a message to all connections in the room
void WebSocketRoom::Broadcast(const std::string& message, WebSocketConnection* exclude) {
    std::lock_guard<std::mutex> lock(mutex_);

    for (auto conn : connections_) {
        if (conn != exclude) {
            conn->Send(message);
        }
    }

    // Store in message history
    StoreMessage(message);
}

// Broadcast binary data to all connections in the room
void WebSocketRoom::BroadcastBinary(const void* data, size_t length, WebSocketConnection* exclude) {
    std::lock_guard<std::mutex> lock(mutex_);

    for (auto conn : connections_) {
        if (conn != exclude) {
            conn->SendBinary(data, length);
        }
    }
}

// Get the number of connections in the room
size_t WebSocketRoom::GetConnectionCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connections_.size();
}

// Get all connections in the room
std::vector<WebSocketConnection*> WebSocketRoom::GetConnections() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connections_;
}

// Implementation of new WebSocketServer methods
Napi::Value WebSocketServer::GetRoomHistory(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::Error::New(env, "Room name is required").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string roomName = info[0].As<Napi::String>().Utf8Value();
    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto it = rooms_.find(roomName);
        if (it == rooms_.end()) {
            return Napi::Array::New(env, 0);
        }

        return ToValue(env, it->second->GetMessageHistory());
    }

    return env.Undefined();
}

// Implementation of WebSocketServer::SetMaxRoomSize
void WebSocketServer::SetMaxRoomSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
        Napi::Error::New(env, "Room name and max size are required").ThrowAsJavaScriptException();
        return;
    }

    std::string roomName = info[0].As<Napi::String>().Utf8Value();
    size_t maxSize = info[1].As<Napi::Number>().Uint32Value();

    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto room = GetRoom(roomName, true);
        room->SetMaxSize(maxSize);
    }
}

void WebSocketServer::SetMaxConnections(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Max connections is required").ThrowAsJavaScriptException();
        return;
    }

    maxConnections_.store(info[0].As<Napi::Number>().Uint32Value());
}

// Implementation of WebSocketServer::SetAuthenticated
void WebSocketServer::SetAuthenticated(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
        Napi::Error::New(env, "Connection ID and auth status are required").ThrowAsJavaScriptException();
        return;
    }

    uint64_t id = info[0].As<Napi::Number>().Int64Value();
    bool authenticated = info[1].As<Napi::Boolean>().Value();

    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto connection = GetConnection(id);
        if (connection) {
            connection->SetAuthenticated(authenticated);
        }
    }
}

Napi::Value WebSocketServer::GetConnectionStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    Napi::Object stats = Napi::Object::New(env);

    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);

        size_t totalConnections = connections_.size();
        size_t authenticatedConnections = 0;
        uint64_t totalBytesSent = 0;
        uint64_t totalBytesReceived = 0;
        size_t roomCount = rooms_.size();

        for (const auto& pair : connections_) {
            if (pair.second->IsAuthenticated()) {
                authenticatedConnections++;
            }
            totalBytesSent += pair.second->GetBytesSent();
            totalBytesReceived += pair.second->GetBytesReceived();
        }

        stats.Set("totalConnections", Napi::Number::New(env, static_cast<double>(totalConnections)));
        stats.Set("authenticatedConnections", Napi::Number::New(env, static_cast<double>(authenticatedConnections)));
        stats.Set("totalBytesSent", Napi::Number::New(env, static_cast<double>(totalBytesSent)));
        stats.Set("totalBytesReceived", Napi::Number::New(env, static_cast<double>(totalBytesReceived)));
        stats.Set("roomCount", Napi::Number::New(env, static_cast<double>(roomCount)));
    }

    return stats;
}

// Implementation of WebSocketServer::DisconnectInactiveConnections
void WebSocketServer::DisconnectInactiveConnections(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Inactivity threshold (in ms) is required").ThrowAsJavaScriptException();
        return;
    }

    uint64_t threshold = info[0].As<Napi::Number>().Int64Value();
    uint64_t now = std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::system_clock::now().time_since_epoch()).count();

    std::vector<uint64_t> toDisconnect;

    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        for (const auto& pair : connections_) {
            if (now - pair.second->GetLastActivity() > threshold) {
                toDisconnect.push_back(pair.first);
            }
        }
    }

    // Disconnect outside the lock to avoid deadlock
    for (uint64_t id : toDisconnect) {
        Napi::HandleScope scope(env);
        CloseConnectionById(id, 1001, "Connection timeout");
    }
}

// Implementation of WebSocketServer::Ping
void WebSocketServer::Ping(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Connection ID is required").ThrowAsJavaScriptException();
        return;
    }

    uint64_t id = info[0].As<Napi::Number>().Int64Value();

    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto connection = GetConnection(id);
        if (connection) {
            connection->Ping();
        }
    }
}

// Implementation of WebSocketServer::SendBinary
void WebSocketServer::SendBinary(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBuffer()) {
        Napi::Error::New(env, "SendBinary requires a connection ID (number) and binary data (Buffer)").ThrowAsJavaScriptException();
        return;
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();

    WebSocketConnection* connection = GetConnection(connectionId);
    if (!connection) {
        return; // Connection not found, silently ignore
    }

    connection->SendBinary(buffer.Data(), buffer.Length());
}

// Implementation of WebSocketServer::BroadcastBinary
void WebSocketServer::BroadcastBinary(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::Error::New(env, "BroadcastBinary requires binary data (Buffer)").ThrowAsJavaScriptException();
        return;
    }

    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    uint64_t excludeId = 0;

    if (info.Length() > 1 && info[1].IsNumber()) {
        excludeId = info[1].As<Napi::Number>().DoubleValue();
    }

    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& pair : connections_) {
        if (pair.first != excludeId) {
            pair.second->SendBinary(buffer.Data(), buffer.Length());
        }
    }
}

// Implementation of WebSocketServer::BroadcastBinaryToRoom
void WebSocketServer::BroadcastBinaryToRoom(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBuffer()) {
        Napi::Error::New(env, "BroadcastBinaryToRoom requires a room name (string) and binary data (Buffer)").ThrowAsJavaScriptException();
        return;
    }

    std::string roomName = info[0].As<Napi::String>().Utf8Value();
    Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();
    uint64_t excludeId = 0;

    if (info.Length() > 2 && info[2].IsNumber()) {
        excludeId = info[2].As<Napi::Number>().DoubleValue();
    }

    WebSocketRoom* room = GetRoom(roomName, false);
    if (!room) {
        return; // Room doesn't exist, silently ignore
    }

    room->BroadcastBinary(buffer.Data(), buffer.Length(), excludeId ? GetConnection(excludeId) : nullptr);
}

// Implementation of WebSocketServer::Init
Napi::Object WebSocketServer::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "WebSocketServer", {
        // Existing methods
        InstanceMethod("start", &WebSocketServer::Start),
        InstanceMethod("stop", &WebSocketServer::Stop),
        InstanceMethod("send", &WebSocketServer::Send),
        InstanceMethod("sendBinary", &WebSocketServer::SendBinary),
        InstanceMethod("broadcast", &WebSocketServer::Broadcast),
        InstanceMethod("broadcastBinary", &WebSocketServer::BroadcastBinary),
        InstanceMethod("closeConnection", &WebSocketServer::CloseConnection),
        InstanceMethod("joinRoom", &WebSocketServer::JoinRoom),
        InstanceMethod("leaveRoom", &WebSocketServer::LeaveRoom),
        InstanceMethod("leaveAllRooms", &WebSocketServer::LeaveAllRooms),
        InstanceMethod("isInRoom", &WebSocketServer::IsInRoom),
        InstanceMethod("getConnectionRooms", &WebSocketServer::GetConnectionRooms),
        InstanceMethod("getRooms", &WebSocketServer::GetRooms),
        InstanceMethod("getRoomSize", &WebSocketServer::GetRoomSize),
        InstanceMethod("getRoomConnections", &WebSocketServer::GetRoomConnections),
        InstanceMethod("getConnectionCount", &WebSocketServer::GetConnectionCount),
        InstanceMethod("broadcastToRoom", &WebSocketServer::BroadcastToRoom),
        InstanceMethod("broadcastBinaryToRoom", &WebSocketServer::BroadcastBinaryToRoom),

        // New methods
        InstanceMethod("ping", &WebSocketServer::Ping),
        InstanceMethod("getRoomHistory", &WebSocketServer::GetRoomHistory),
        InstanceMethod("setMaxRoomSize", &WebSocketServer::SetMaxRoomSize),
        InstanceMethod("setMaxConnections", &WebSocketServer::SetMaxConnections),
        InstanceMethod("setAuthenticated", &WebSocketServer::SetAuthenticated),
        InstanceMethod("getConnectionStats", &WebSocketServer::GetConnectionStats),
        InstanceMethod("disconnectInactiveConnections", &WebSocketServer::DisconnectInactiveConnections),
        InstanceMethod("cleanup", &WebSocketServer::Cleanup),
        InstanceMethod("on", &WebSocketServer::On)
    });

    // Create constructor reference safely
    Napi::FunctionReference* constructor = new Napi::FunctionReference();

    // Make sure the reference is valid before adding it to cleanup
    if (constructor) {
        *constructor = Napi::Persistent(func);

        // Store constructor reference for future access
        env.SetInstanceData(constructor);

        // Add to cleanup list with proper null check
        nexurejs::AddCleanupReference(constructor);

        // Set export
        exports.Set("WebSocketServer", func);
    }

    return exports;
}

// Initialize the WebSocket native module
Napi::Object InitWebSocket(Napi::Env env, Napi::Object exports) {
    return WebSocketServer::Init(env, exports);
}

// Implementation of WebSocketServer::CloseConnectionById
void WebSocketServer::CloseConnectionById(uint64_t id, int code, const std::string& reason) {
    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto connection = GetConnection(id);
        if (connection) {
            connection->Close(code, reason);
        }
    }
}

// Implementation of WebSocketServer::GetConnection
WebSocketConnection* WebSocketServer::GetConnection(uint64_t id) {
    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto it = connections_.find(id);
        return it != connections_.end() ? it->second.get() : nullptr;
    }
    return nullptr;
}

// Implementation of WebSocketServer::GetRoom
WebSocketRoom* WebSocketServer::GetRoom(const std::string& name, bool create) {
    if (auto* server = this) {
        std::lock_guard<std::mutex> lock(server->mutex_);
        auto it = rooms_.find(name);
        if (it == rooms_.end() && create) {
            auto room = std::make_unique<WebSocketRoom>(name);
            WebSocketRoom* roomPtr = room.get();
            rooms_[name] = std::move(room);
            return roomPtr;
        }
        return it != rooms_.end() ? it->second.get() : nullptr;
    }
    return nullptr;
}

// Implementation of WebSocketServer::GetRoomSize
Napi::Value WebSocketServer::GetRoomSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::Error::New(env, "GetRoomSize requires a room name").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string roomName = info[0].As<Napi::String>().Utf8Value();
    WebSocketRoom* room = GetRoom(roomName, false);

    if (!room) {
        return Napi::Number::New(env, 0);
    }

    return Napi::Number::New(env, room->GetConnectionCount());
}

// Implementation of WebSocketServer::GetRooms
Napi::Value WebSocketServer::GetRooms(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::vector<std::string> roomNames;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        for (const auto& pair : rooms_) {
            roomNames.push_back(pair.first);
        }
    }

    return ToValue(env, roomNames);
}

// Implementation of WebSocketServer::GetConnectionRooms
Napi::Value WebSocketServer::GetConnectionRooms(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "GetConnectionRooms requires a connection ID").ThrowAsJavaScriptException();
        return env.Null();
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    WebSocketConnection* connection = GetConnection(connectionId);

    if (!connection) {
        return Napi::Array::New(env);
    }

    return ToValue(env, connection->GetRooms());
}

// Implementation of WebSocketServer::IsInRoom
Napi::Value WebSocketServer::IsInRoom(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
        Napi::Error::New(env, "IsInRoom requires a connection ID and room name").ThrowAsJavaScriptException();
        return env.Null();
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    std::string roomName = info[1].As<Napi::String>().Utf8Value();
    WebSocketConnection* connection = GetConnection(connectionId);

    if (!connection) {
        return Napi::Boolean::New(env, false);
    }

    return Napi::Boolean::New(env, connection->IsInRoom(roomName));
}

// Implementation of WebSocketServer::GetRoomConnections
Napi::Value WebSocketServer::GetRoomConnections(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::Error::New(env, "GetRoomConnections requires a room name").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string roomName = info[0].As<Napi::String>().Utf8Value();
    WebSocketRoom* room = GetRoom(roomName, false);

    if (!room) {
        return Napi::Array::New(env);
    }

    auto connections = room->GetConnections();
    Napi::Array result = Napi::Array::New(env, connections.size());

    for (size_t i = 0; i < connections.size(); i++) {
        result[i] = Napi::Number::New(env, connections[i]->GetId());
    }

    return result;
}

// Implementation of WebSocketServer::GetConnectionCount
Napi::Value WebSocketServer::GetConnectionCount(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(mutex_);
    return Napi::Number::New(env, connections_.size());
}

// Implementation of WebSocketServer::Send
void WebSocketServer::Send(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !(info[1].IsString() || info[1].IsObject())) {
        Napi::Error::New(env, "Send requires a connection ID and message").ThrowAsJavaScriptException();
        return;
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    std::string message;

    if (info[1].IsString()) {
        message = info[1].As<Napi::String>().Utf8Value();
    } else if (info[1].IsObject()) {
        // Convert object to JSON string
        Napi::Object obj = info[1].As<Napi::Object>();
        Napi::Function stringifyFn = env.Global().Get("JSON").As<Napi::Object>().Get("stringify").As<Napi::Function>();
        message = stringifyFn.Call({obj}).As<Napi::String>().Utf8Value();
    }

    WebSocketConnection* connection = GetConnection(connectionId);
    if (!connection) {
        return; // Connection not found, silently ignore
    }

    connection->Send(message);
}

// Implementation of WebSocketServer::Broadcast
void WebSocketServer::Broadcast(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !(info[0].IsString() || info[0].IsObject())) {
        Napi::Error::New(env, "Broadcast requires a message").ThrowAsJavaScriptException();
        return;
    }

    std::string message;

    if (info[0].IsString()) {
        message = info[0].As<Napi::String>().Utf8Value();
    } else if (info[0].IsObject()) {
        // Convert object to JSON string
        Napi::Object obj = info[0].As<Napi::Object>();
        Napi::Function stringifyFn = env.Global().Get("JSON").As<Napi::Object>().Get("stringify").As<Napi::Function>();
        message = stringifyFn.Call({obj}).As<Napi::String>().Utf8Value();
    }

    uint64_t excludeId = 0;

    if (info.Length() > 1 && info[1].IsNumber()) {
        excludeId = info[1].As<Napi::Number>().DoubleValue();
    }

    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& pair : connections_) {
        if (pair.first != excludeId) {
            pair.second->Send(message);
        }
    }
}

// Implementation of WebSocketServer::BroadcastToRoom
void WebSocketServer::BroadcastToRoom(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !(info[1].IsString() || info[1].IsObject())) {
        Napi::Error::New(env, "BroadcastToRoom requires a room name and message").ThrowAsJavaScriptException();
        return;
    }

    std::string roomName = info[0].As<Napi::String>().Utf8Value();
    std::string message;

    if (info[1].IsString()) {
        message = info[1].As<Napi::String>().Utf8Value();
    } else if (info[1].IsObject()) {
        // Convert object to JSON string
        Napi::Object obj = info[1].As<Napi::Object>();
        Napi::Function stringifyFn = env.Global().Get("JSON").As<Napi::Object>().Get("stringify").As<Napi::Function>();
        message = stringifyFn.Call({obj}).As<Napi::String>().Utf8Value();
    }

    uint64_t excludeId = 0;

    if (info.Length() > 2 && info[2].IsNumber()) {
        excludeId = info[2].As<Napi::Number>().DoubleValue();
    }

    WebSocketRoom* room = GetRoom(roomName, false);
    if (!room) {
        return; // Room doesn't exist, silently ignore
    }

    room->Broadcast(message, excludeId ? GetConnection(excludeId) : nullptr);
}

// Implementation of WebSocketServer::JoinRoom
void WebSocketServer::JoinRoom(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
        Napi::Error::New(env, "JoinRoom requires a connection ID and room name").ThrowAsJavaScriptException();
        return;
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    std::string roomName = info[1].As<Napi::String>().Utf8Value();

    WebSocketConnection* connection = GetConnection(connectionId);
    if (!connection) {
        return; // Connection not found, silently ignore
    }

    connection->JoinRoom(roomName);
    OnRoomJoin(connection, roomName);
}

// Implementation of WebSocketServer::LeaveRoom
void WebSocketServer::LeaveRoom(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
        Napi::Error::New(env, "LeaveRoom requires a connection ID and room name").ThrowAsJavaScriptException();
        return;
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    std::string roomName = info[1].As<Napi::String>().Utf8Value();

    WebSocketConnection* connection = GetConnection(connectionId);
    if (!connection) {
        return; // Connection not found, silently ignore
    }

    connection->LeaveRoom(roomName);
    OnRoomLeave(connection, roomName);
}

// Implementation of WebSocketServer::LeaveAllRooms
void WebSocketServer::LeaveAllRooms(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "LeaveAllRooms requires a connection ID").ThrowAsJavaScriptException();
        return;
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();

    WebSocketConnection* connection = GetConnection(connectionId);
    if (!connection) {
        return; // Connection not found, silently ignore
    }

    // Get rooms before leaving all, so we can emit events
    std::vector<std::string> rooms = connection->GetRooms();

    connection->LeaveAllRooms();

    // Emit events for each room left
    for (const std::string& roomName : rooms) {
        OnRoomLeave(connection, roomName);
    }
}

// Implementation of WebSocketServer::CloseConnection
void WebSocketServer::CloseConnection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "CloseConnection requires a connection ID").ThrowAsJavaScriptException();
        return;
    }

    uint64_t connectionId = info[0].As<Napi::Number>().DoubleValue();
    int code = 1000; // Normal closure
    std::string reason = "";

    if (info.Length() > 1 && info[1].IsNumber()) {
        code = info[1].As<Napi::Number>().Int32Value();
    }

    if (info.Length() > 2 && info[2].IsString()) {
        reason = info[2].As<Napi::String>().Utf8Value();
    }

    CloseConnectionById(connectionId, code, reason);
}

// Implementation of WebSocketServer::Start
void WebSocketServer::Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (isRunning_) {
        return; // Already running, silently ignore
    }

    // Initialize server
    int r = uv_tcp_init(uv_default_loop(), &server_);
    if (r) {
        Napi::Error::New(env, "Failed to initialize TCP server").ThrowAsJavaScriptException();
        return;
    }

    // Set up data pointer to this instance
    server_.data = this;

    // Bind to address
    struct sockaddr_in addr;
    r = uv_ip4_addr("0.0.0.0", 0, &addr); // Port 0 means we're not binding to a specific port
    if (r) {
        Napi::Error::New(env, "Failed to create address").ThrowAsJavaScriptException();
        return;
    }

    r = uv_tcp_bind(&server_, reinterpret_cast<const struct sockaddr*>(&addr), 0);
    if (r) {
        Napi::Error::New(env, "Failed to bind server").ThrowAsJavaScriptException();
        return;
    }

    // Set up connection callback
    r = uv_listen(reinterpret_cast<uv_stream_t*>(&server_), 128, [](uv_stream_t* server, int status) {
        WebSocketServer* self = static_cast<WebSocketServer*>(server->data);
        self->OnConnection(server, status);
    });

    if (r) {
        Napi::Error::New(env, "Failed to start listening").ThrowAsJavaScriptException();
        return;
    }

    isRunning_ = true;
}

// Implementation of WebSocketServer::Stop
void WebSocketServer::Stop(const Napi::CallbackInfo& info) {
    if (!isRunning_) {
        return; // Not running, silently ignore
    }

    if (isRunning_) {
        // Close all connections
        std::vector<uint64_t> connectionIds;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            for (const auto& pair : connections_) {
                connectionIds.push_back(pair.first);
            }
        }

        for (uint64_t id : connectionIds) {
            CloseConnectionById(id, 1001, "Server shutting down");
        }

        // Close server
        uv_close(reinterpret_cast<uv_handle_t*>(&server_), nullptr);

        isRunning_ = false;
    }
}

// WebSocketServer constructor implementation
WebSocketServer::WebSocketServer(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<WebSocketServer>(info) {
    Napi::Env env = info.Env();

    // Initialize atomic in constructor
    maxConnections_.store(0);

    // Check arguments
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "WebSocketServer constructor requires an options object").ThrowAsJavaScriptException();
        return;
    }

    Napi::Object options = info[0].As<Napi::Object>();

    if (options.Has("onConnection") && options.Get("onConnection").IsFunction()) {
        onConnectionCallback_ = Napi::Persistent(options.Get("onConnection").As<Napi::Function>());
    }

    if (options.Has("onMessage") && options.Get("onMessage").IsFunction()) {
        onMessageCallback_ = Napi::Persistent(options.Get("onMessage").As<Napi::Function>());
    }

    if (options.Has("onBinaryMessage") && options.Get("onBinaryMessage").IsFunction()) {
        onBinaryMessageCallback_ = Napi::Persistent(options.Get("onBinaryMessage").As<Napi::Function>());
    }

    if (options.Has("onDisconnect") && options.Get("onDisconnect").IsFunction()) {
        onDisconnectCallback_ = Napi::Persistent(options.Get("onDisconnect").As<Napi::Function>());
    }

    if (options.Has("onError") && options.Get("onError").IsFunction()) {
        onErrorCallback_ = Napi::Persistent(options.Get("onError").As<Napi::Function>());
    }

    if (options.Has("onRoomJoin") && options.Get("onRoomJoin").IsFunction()) {
        onRoomJoinCallback_ = Napi::Persistent(options.Get("onRoomJoin").As<Napi::Function>());
    }

    if (options.Has("onRoomLeave") && options.Get("onRoomLeave").IsFunction()) {
        onRoomLeaveCallback_ = Napi::Persistent(options.Get("onRoomLeave").As<Napi::Function>());
    }

    if (options.Has("onPing") && options.Get("onPing").IsFunction()) {
        onPingCallback_ = Napi::Persistent(options.Get("onPing").As<Napi::Function>());
    }

    if (options.Has("onPong") && options.Get("onPong").IsFunction()) {
        onPongCallback_ = Napi::Persistent(options.Get("onPong").As<Napi::Function>());
    }
}

// WebSocketServer destructor
WebSocketServer::~WebSocketServer() {
    // Use a separate destructor block to avoid potential issues during shutdown
    try {
        if (isRunning_) {
            // Acquire a lock
            std::lock_guard<std::mutex> lock(mutex_);

            // Stop the server - mark as not running first to prevent new connections
            isRunning_ = false;

            // Close all connections safely
            std::vector<uint64_t> connectionIds;
            connectionIds.reserve(connections_.size());

            for (const auto& pair : connections_) {
                connectionIds.push_back(pair.first);
            }

            // Release the lock to avoid deadlocks when closing connections
            mutex_.unlock();

            // Close connections one by one
            for (uint64_t id : connectionIds) {
                try {
                    CloseConnectionById(id, 1001, "Server shutting down");
                } catch (...) {
                    // Ignore errors during cleanup
                }
            }

            // Re-acquire the lock for final cleanup
            std::lock_guard<std::mutex> finalLock(mutex_);

            // Close the server handle if it's still active
            if (uv_is_active(reinterpret_cast<uv_handle_t*>(&server_))) {
                uv_close(reinterpret_cast<uv_handle_t*>(&server_), nullptr);
            }

            // Clear remaining connections and rooms
            connections_.clear();
            rooms_.clear();
        }
    } catch (...) {
        // Ensure we don't throw from the destructor
    }

    // Release callback references explicitly
    onConnectionCallback_.Reset();
    onMessageCallback_.Reset();
    onBinaryMessageCallback_.Reset();
    onDisconnectCallback_.Reset();
    onErrorCallback_.Reset();
    onRoomJoinCallback_.Reset();
    onRoomLeaveCallback_.Reset();
    onPingCallback_.Reset();
    onPongCallback_.Reset();
}

// Implementation of OnConnection method
void WebSocketServer::OnConnection(uv_stream_t* server, int status) {
    if (status < 0) {
        // Error in accept
        OnError("Error accepting connection: " + std::string(uv_strerror(status)));
        return;
    }

    // Create a client handle
    uv_tcp_t* client = new uv_tcp_t();
    uv_tcp_init(uv_default_loop(), client);

    // Accept the connection
    if (uv_accept(server, reinterpret_cast<uv_stream_t*>(client)) != 0) {
        uv_close(reinterpret_cast<uv_handle_t*>(client), nullptr);
        OnError("Failed to accept connection");
        return;
    }

    // Check if we're at max connections
    if (maxConnections_ > 0) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (connections_.size() >= maxConnections_) {
            // Too many connections
            uv_close(reinterpret_cast<uv_handle_t*>(client), nullptr);
            OnError("Max connections reached");
            return;
        }
    }

    // Create a WebSocketConnection object for this client
    auto connection = std::make_unique<WebSocketConnection>(client, this);

    // Store the connection
    {
        std::lock_guard<std::mutex> lock(mutex_);
        connections_[connection->GetId()] = std::move(connection);
    }

    // Get the connection back (now owned by the map)
    WebSocketConnection* conn = GetConnection(connection->GetId());

    // Emit connection event to JavaScript
    if (!onConnectionCallback_.IsEmpty()) {
        Napi::Env env = onConnectionCallback_.Env();

        // Create the connection info object
        Napi::Object connInfo = Napi::Object::New(env);
        connInfo.Set("id", Napi::Number::New(env, conn->GetId()));

        onConnectionCallback_.Call({connInfo});
    }
}

// Implementation of WebSocketServer OnMessage
void WebSocketServer::OnMessage(WebSocketConnection* connection, const std::string& message) {
    if (onMessageCallback_.IsEmpty()) {
        return;
    }

    Napi::Env env = onMessageCallback_.Env();

    // Create the event object
    Napi::Object event = Napi::Object::New(env);
    event.Set("id", Napi::Number::New(env, connection->GetId()));
    event.Set("message", Napi::String::New(env, message));

    onMessageCallback_.Call({event});
}

// Implementation of WebSocketServer OnBinaryMessage
void WebSocketServer::OnBinaryMessage(WebSocketConnection* connection, const void* data, size_t length) {
    if (onBinaryMessageCallback_.IsEmpty()) {
        return;
    }

    Napi::Env env = onBinaryMessageCallback_.Env();

    // Create the event object
    Napi::Object event = Napi::Object::New(env);
    event.Set("id", Napi::Number::New(env, connection->GetId()));
    event.Set("binary", Napi::Buffer<uint8_t>::Copy(env, static_cast<const uint8_t*>(data), length));

    onBinaryMessageCallback_.Call({event});
}

// Implementation of WebSocketServer OnDisconnect
void WebSocketServer::OnDisconnect(WebSocketConnection* connection, uint16_t code, const std::string& reason) {
    uint64_t connectionId = connection->GetId();

    // Remove connection from all rooms
    connection->LeaveAllRooms();

    // Emit disconnect event to JavaScript
    if (!onDisconnectCallback_.IsEmpty()) {
        Napi::Env env = onDisconnectCallback_.Env();

        // Create the event object
        Napi::Object event = Napi::Object::New(env);
        event.Set("id", Napi::Number::New(env, connectionId));
        event.Set("code", Napi::Number::New(env, code));
        event.Set("reason", Napi::String::New(env, reason));

        onDisconnectCallback_.Call({event});
    }

    // Remove from connections map
    {
        std::lock_guard<std::mutex> lock(mutex_);
        connections_.erase(connectionId);
    }
}

// Implementation of WebSocketServer OnRoomJoin
void WebSocketServer::OnRoomJoin(WebSocketConnection* connection, const std::string& roomName) {
    // Get or create the room
    WebSocketRoom* room = GetRoom(roomName);

    // Add the connection to the room
    room->AddConnection(connection);

    // Emit room join event to JavaScript
    if (!onRoomJoinCallback_.IsEmpty()) {
        Napi::Env env = onRoomJoinCallback_.Env();

        // Create the event object
        Napi::Object event = Napi::Object::New(env);
        event.Set("id", Napi::Number::New(env, connection->GetId()));
        event.Set("room", Napi::String::New(env, roomName));

        onRoomJoinCallback_.Call({event});
    }
}

// Implementation of WebSocketServer OnRoomLeave
void WebSocketServer::OnRoomLeave(WebSocketConnection* connection, const std::string& roomName) {
    // Get the room
    WebSocketRoom* room = GetRoom(roomName, false);
    if (!room) {
        return;  // Room doesn't exist
    }

    // Remove the connection from the room
    room->RemoveConnection(connection);

    // If the room is now empty, remove it
    if (room->GetConnectionCount() == 0) {
        std::lock_guard<std::mutex> lock(mutex_);
        rooms_.erase(roomName);
    }

    // Emit room leave event to JavaScript
    if (!onRoomLeaveCallback_.IsEmpty()) {
        Napi::Env env = onRoomLeaveCallback_.Env();

        // Create the event object
        Napi::Object event = Napi::Object::New(env);
        event.Set("id", Napi::Number::New(env, connection->GetId()));
        event.Set("room", Napi::String::New(env, roomName));

        onRoomLeaveCallback_.Call({event});
    }
}

// Implementation of WebSocketServer OnPing
void WebSocketServer::OnPing(WebSocketConnection* connection) {
    if (onPingCallback_.IsEmpty()) {
        return;
    }

    Napi::Env env = onPingCallback_.Env();

    // Create the event object
    Napi::Object event = Napi::Object::New(env);
    event.Set("id", Napi::Number::New(env, connection->GetId()));

    onPingCallback_.Call({event});
}

// Implementation of WebSocketServer OnPong
void WebSocketServer::OnPong(WebSocketConnection* connection) {
    if (onPongCallback_.IsEmpty()) {
        return;
    }

    Napi::Env env = onPongCallback_.Env();

    // Create the event object
    Napi::Object event = Napi::Object::New(env);
    event.Set("id", Napi::Number::New(env, connection->GetId()));

    onPongCallback_.Call({event});
}

// Implementation of WebSocketServer OnError
void WebSocketServer::OnError(const std::string& error) {
    if (onErrorCallback_.IsEmpty()) {
        return;
    }

    Napi::Env env = onErrorCallback_.Env();

    onErrorCallback_.Call({Napi::String::New(env, error)});
}

// Add implementations for StoreMessage and GetMessageHistory
void WebSocketRoom::StoreMessage(const std::string& message, size_t maxHistory) {
    std::lock_guard<std::mutex> lock(mutex_);
    messageHistory_.push_back(message);
    if (maxHistory > 0 && messageHistory_.size() > maxHistory) {
        messageHistory_.pop_front();
    }
}

std::vector<std::string> WebSocketRoom::GetMessageHistory() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return std::vector<std::string>(messageHistory_.begin(), messageHistory_.end());
}

// Implementation for getting authenticated connections
std::vector<WebSocketConnection*> WebSocketRoom::GetAuthenticatedConnections() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<WebSocketConnection*> authenticatedConnections;
    for (auto connection : connections_) {
        if (connection->IsAuthenticated()) {
            authenticatedConnections.push_back(connection);
        }
    }
    return authenticatedConnections;
}

// Implementation of the ping method
void WebSocketConnection::Ping() {
    SendFrame(WS_PING, nullptr, 0, false);
}

// Implementation of WebSocketConnection destructor
WebSocketConnection::~WebSocketConnection() {
    // Clean up userData references
    try {
        std::lock_guard<std::mutex> lock(mutex_);

        // Reset all Napi references
        for (auto& item : userData_) {
            try {
                if (!item.second.IsEmpty()) {
                    item.second.Reset();
                }
            } catch (...) {
                // Ignore errors during cleanup
            }
        }

        userData_.clear();

        // Clean up client if it still exists
        if (client_ && client_->data) {
            client_->data = nullptr;

            // If handle is still active, close it
            if (!uv_is_closing(reinterpret_cast<uv_handle_t*>(client_))) {
                uv_close(reinterpret_cast<uv_handle_t*>(client_), OnClose);
            }

            client_ = nullptr;
        }

        // Clear the rooms list to avoid any lingering references
        rooms_.clear();
    } catch (...) {
        // Ensure we don't throw from destructor
    }
}

// Implementation of WebSocketServer::Cleanup
void WebSocketServer::Cleanup(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
        // Stop the server if it's running
        if (isRunning_) {
            // Acquire a lock
            std::lock_guard<std::mutex> lock(mutex_);

            // Stop the server - mark as not running first to prevent new connections
            isRunning_ = false;

            // Close all connections safely
            std::vector<uint64_t> connectionIds;
            connectionIds.reserve(connections_.size());

            for (const auto& pair : connections_) {
                connectionIds.push_back(pair.first);
            }

            // Release the lock to avoid deadlocks when closing connections
            mutex_.unlock();

            // Close connections one by one
            for (uint64_t id : connectionIds) {
                try {
                    CloseConnectionById(id, 1001, "Server cleanup");
                } catch (...) {
                    // Ignore errors during cleanup
                }
            }

            // Re-acquire the lock for final cleanup
            std::lock_guard<std::mutex> finalLock(mutex_);

            // Close the server handle if it's still active
            if (uv_is_active(reinterpret_cast<uv_handle_t*>(&server_))) {
                uv_close(reinterpret_cast<uv_handle_t*>(&server_), nullptr);
            }

            // Clear remaining connections and rooms
            connections_.clear();
            rooms_.clear();
        }
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Error during WebSocketServer cleanup: ") + e.what())
            .ThrowAsJavaScriptException();
    } catch (...) {
        Napi::Error::New(env, "Unknown error during WebSocketServer cleanup")
            .ThrowAsJavaScriptException();
    }
}

// Implementation of WebSocketServer::On
Napi::Value WebSocketServer::On(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected event name and callback function").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string eventName = info[0].As<Napi::String>().Utf8Value();
    Napi::Function callback = info[1].As<Napi::Function>();

    // Store the callback based on the event name
    if (eventName == "connection") {
        onConnectionCallback_ = Napi::Persistent(callback);
    } else if (eventName == "message") {
        onMessageCallback_ = Napi::Persistent(callback);
    } else if (eventName == "binaryMessage") {
        onBinaryMessageCallback_ = Napi::Persistent(callback);
    } else if (eventName == "disconnect") {
        onDisconnectCallback_ = Napi::Persistent(callback);
    } else if (eventName == "error") {
        onErrorCallback_ = Napi::Persistent(callback);
    } else if (eventName == "roomJoin") {
        onRoomJoinCallback_ = Napi::Persistent(callback);
    } else if (eventName == "roomLeave") {
        onRoomLeaveCallback_ = Napi::Persistent(callback);
    } else if (eventName == "ping") {
        onPingCallback_ = Napi::Persistent(callback);
    } else if (eventName == "pong") {
        onPongCallback_ = Napi::Persistent(callback);
    } else {
        Napi::TypeError::New(env, "Unknown event name: " + eventName).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Return this for chaining
    return info.This();
}
