#pragma once
#include <napi.h>
#include <uv.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <queue>
#include <mutex>
#include <atomic>
#include <thread>
#include <cstdint>

// Forward declaration of WebSocketServer class
class WebSocketServer;

namespace nexurejs {
  // Forward declaration
  void AddCleanupReference(Napi::FunctionReference* ref);
}

/**
 * Initialize the WebSocket native module
 * @param env The NAPI environment
 * @param exports The exports object
 * @returns The exports object with WebSocket methods
 */
Napi::Object InitWebSocket(Napi::Env env, Napi::Object exports);

// WebSocket frame opcodes
enum class WebSocketOpcode : uint8_t {
  CONTINUATION_FRAME = 0x0,
  TEXT_FRAME = 0x1,
  BINARY_FRAME = 0x2,
  CLOSE_FRAME = 0x8,
  PING_FRAME = 0x9,
  PONG_FRAME = 0xA
};

// WebSocket frame structure
struct WebSocketFrame {
  bool fin = false;
  bool rsv1 = false;
  bool rsv2 = false;
  bool rsv3 = false;
  WebSocketOpcode opcode = WebSocketOpcode::TEXT_FRAME;
  bool masked = false;
  uint8_t mask[4] = {0};
  uint64_t payload_length = 0;
  std::vector<uint8_t> payload;
  std::string error;
};

// WebSocket route matching result
struct WSRouteMatch {
  bool found;
  Napi::FunctionReference handler;
};

class WebSocketHandler : public Napi::ObjectWrap<WebSocketHandler> {
public:
  // Initialization and constructor
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;

  WebSocketHandler(const Napi::CallbackInfo& info);
  ~WebSocketHandler() = default;

  // Public API methods
  Napi::Value ParseFrame(const Napi::CallbackInfo& info);
  Napi::Value CreateFrame(const Napi::CallbackInfo& info);
  Napi::Value CreateTextFrame(const Napi::CallbackInfo& info);
  Napi::Value CreateBinaryFrame(const Napi::CallbackInfo& info);
  Napi::Value CreateCloseFrame(const Napi::CallbackInfo& info);
  Napi::Value CreatePingFrame(const Napi::CallbackInfo& info);
  Napi::Value CreatePongFrame(const Napi::CallbackInfo& info);
  Napi::Value MaskData(const Napi::CallbackInfo& info);
  Napi::Value ValidateUTF8(const Napi::CallbackInfo& info);

  // Static methods
  static Napi::Value GetMetrics(const Napi::CallbackInfo& info);
  static Napi::Value GetCapabilities(const Napi::CallbackInfo& info);
  static Napi::Value Benchmark(const Napi::CallbackInfo& info);

private:
  // SIMD capability detection
  static bool HasAVX2();
  static bool HasSSE42();

  // SIMD optimization methods
  static void MaskData_SIMD(uint8_t* data, size_t length, const uint8_t mask[4]);
  static bool ValidateUTF8_SIMD(const uint8_t* data, size_t length);
  static bool ValidateUTF8_Scalar(const uint8_t* data, size_t length);

  // Frame processing methods
  static WebSocketFrame ParseFrame_SIMD(const uint8_t* data, size_t length, size_t& bytesConsumed);
  static std::vector<uint8_t> CreateFrame_SIMD(WebSocketOpcode opcode,
                                              const uint8_t* payload,
                                              size_t payload_length,
                                              bool mask);
};
