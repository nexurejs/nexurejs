const http = require('http');
const { performance } = require('perf_hooks');

/**
 * Real-time WebSocket Server using NexureJS Native WebSocket Module
 * Demonstrates high-performance real-time communication with native acceleration
 */

class RealtimeWebSocketServer {
  constructor() {
    this.native = null;
    this.server = null;
    this.clients = new Map();
    this.rooms = new Map();
    this.cache = null;
    this.jsonProcessor = null;
    this.compression = null;
    this.metrics = {
      connections: 0,
      messages: 0,
      broadcasts: 0,
      dataTransferred: 0,
      compressionSavings: 0
    };
  }

  async initialize() {
    try {
      // Load native modules
      this.native = require('../../build/Release/nexurejs_native.node');
      console.log(`🚀 Loaded NexureJS Native v${this.native.version}`);

      // Initialize native modules
      this.cache = new this.native.LRUCache(5000); // Client session cache
      this.jsonProcessor = new this.native.JsonProcessor();

      console.log('✅ Real-time WebSocket server initialized with native modules');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize native modules:', error.message);
      return false;
    }
  }

  setupWebSocketHandlers() {
    // Note: This would integrate with the native WebSocket module
    // For demo purposes, we'll show the structure
    console.log('🔌 WebSocket handlers configured with native module');
  }

  handleConnection(clientId, socket) {
    this.metrics.connections++;

    const client = {
      id: clientId,
      socket: socket,
      rooms: new Set(),
      connectedAt: Date.now(),
      messageCount: 0
    };

    this.clients.set(clientId, client);

    // Cache client session using native cache
    const sessionData = {
      clientId,
      connectedAt: client.connectedAt,
      userAgent: socket.headers?.['user-agent'] || 'unknown'
    };

    this.cache.set(`session:${clientId}`, this.jsonProcessor.stringify(sessionData));

    console.log(`🔗 Client ${clientId} connected. Total clients: ${this.clients.size}`);

    // Send welcome message with server info
    this.sendToClient(clientId, {
      type: 'welcome',
      data: {
        clientId,
        serverVersion: this.native.version,
        nativeModules: Object.keys(this.native).filter(k => k.includes('Initialized') && this.native[k]).length,
        timestamp: Date.now()
      }
    });
  }

  handleDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from rooms
    client.rooms.forEach(roomId => {
      this.leaveRoom(clientId, roomId);
    });

    // Remove from clients
    this.clients.delete(clientId);

    // Remove session cache
    this.cache.delete(`session:${clientId}`);

    console.log(`❌ Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
  }

  handleMessage(clientId, rawMessage) {
    this.metrics.messages++;

    try {
      // Parse message using native JSON processor
      const message = this.jsonProcessor.parse(rawMessage);

      const client = this.clients.get(clientId);
      if (!client) return;

      client.messageCount++;

      // Handle different message types
      switch (message.type) {
        case 'join_room':
          this.handleJoinRoom(clientId, message.data);
          break;
        case 'leave_room':
          this.handleLeaveRoom(clientId, message.data);
          break;
        case 'room_message':
          this.handleRoomMessage(clientId, message.data);
          break;
        case 'private_message':
          this.handlePrivateMessage(clientId, message.data);
          break;
        case 'broadcast':
          this.handleBroadcast(clientId, message.data);
          break;
        case 'get_stats':
          this.sendStats(clientId);
          break;
        case 'benchmark':
          this.runBenchmark(clientId);
          break;
        default:
          this.sendError(clientId, 'Unknown message type');
      }
    } catch (error) {
      console.error(`Error handling message from ${clientId}:`, error);
      this.sendError(clientId, 'Invalid message format');
    }
  }

  handleJoinRoom(clientId, data) {
    const { roomId } = data;
    const client = this.clients.get(clientId);

    if (!client) return;

    // Add client to room
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(clientId);
    client.rooms.add(roomId);

    // Cache room membership
    const roomKey = `room:${roomId}`;
    const roomData = this.cache.get(roomKey);
    let room = roomData ? this.jsonProcessor.parse(roomData) : { members: [], created: Date.now() };

    if (!room.members.includes(clientId)) {
      room.members.push(clientId);
      this.cache.set(roomKey, this.jsonProcessor.stringify(room));
    }

    console.log(`📡 Client ${clientId} joined room ${roomId}`);

    // Notify room members
    this.broadcastToRoom(roomId, {
      type: 'user_joined',
      data: { clientId, roomId, timestamp: Date.now() }
    }, clientId);

    // Send confirmation to client
    this.sendToClient(clientId, {
      type: 'room_joined',
      data: { roomId, memberCount: this.rooms.get(roomId).size }
    });
  }

  handleLeaveRoom(clientId, data) {
    const { roomId } = data;
    this.leaveRoom(clientId, roomId);
  }

  leaveRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    const room = this.rooms.get(roomId);

    if (!client || !room) return;

    room.delete(clientId);
    client.rooms.delete(roomId);

    // Update cache
    const roomKey = `room:${roomId}`;
    const roomData = this.cache.get(roomKey);
    if (roomData) {
      let roomInfo = this.jsonProcessor.parse(roomData);
      roomInfo.members = roomInfo.members.filter(id => id !== clientId);
      this.cache.set(roomKey, this.jsonProcessor.stringify(roomInfo));
    }

    // Remove empty rooms
    if (room.size === 0) {
      this.rooms.delete(roomId);
      this.cache.delete(roomKey);
    } else {
      // Notify remaining members
      this.broadcastToRoom(roomId, {
        type: 'user_left',
        data: { clientId, roomId, timestamp: Date.now() }
      });
    }

    console.log(`📡 Client ${clientId} left room ${roomId}`);
  }

  handleRoomMessage(clientId, data) {
    const { roomId, message } = data;

    if (!this.rooms.has(roomId) || !this.rooms.get(roomId).has(clientId)) {
      this.sendError(clientId, 'Not in room');
      return;
    }

    this.broadcastToRoom(roomId, {
      type: 'room_message',
      data: {
        from: clientId,
        roomId,
        message,
        timestamp: Date.now()
      }
    }, clientId);
  }

  handlePrivateMessage(clientId, data) {
    const { targetId, message } = data;

    if (!this.clients.has(targetId)) {
      this.sendError(clientId, 'Target client not found');
      return;
    }

    this.sendToClient(targetId, {
      type: 'private_message',
      data: {
        from: clientId,
        message,
        timestamp: Date.now()
      }
    });
  }

  handleBroadcast(clientId, data) {
    const { message } = data;

    this.broadcast({
      type: 'broadcast',
      data: {
        from: clientId,
        message,
        timestamp: Date.now()
      }
    }, clientId);

    this.metrics.broadcasts++;
  }

  sendToClient(clientId, message, compress = true) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Serialize using native JSON processor
      let jsonData = this.jsonProcessor.stringify(message);
      let finalData = jsonData;

      // Compress large messages using native compression
      if (compress && jsonData.length > 1024) {
        const compressed = this.native.compress(Buffer.from(jsonData));
        const savings = jsonData.length - compressed.length;
        this.metrics.compressionSavings += savings;

        // Send compressed data (in real implementation)
        finalData = compressed.toString('base64');
        message._compressed = true;
      }

      this.metrics.dataTransferred += finalData.length;

      // In real implementation, this would use the native WebSocket module
      console.log(`📤 Sending to ${clientId}: ${message.type} (${finalData.length} bytes)`);

    } catch (error) {
      console.error(`Error sending message to ${clientId}:`, error);
    }
  }

  broadcastToRoom(roomId, message, excludeClient = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.forEach(clientId => {
      if (clientId !== excludeClient) {
        this.sendToClient(clientId, message);
      }
    });
  }

  broadcast(message, excludeClient = null) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClient) {
        this.sendToClient(clientId, message);
      }
    });
  }

  sendError(clientId, error) {
    this.sendToClient(clientId, {
      type: 'error',
      data: { error, timestamp: Date.now() }
    });
  }

  sendStats(clientId) {
    const stats = {
      server: {
        version: this.native.version,
        platform: this.native.platform,
        uptime: process.uptime()
      },
      clients: {
        total: this.clients.size,
        rooms: this.rooms.size
      },
      metrics: {
        totalConnections: this.metrics.connections,
        totalMessages: this.metrics.messages,
        totalBroadcasts: this.metrics.broadcasts,
        dataTransferred: this.metrics.dataTransferred,
        compressionSavings: this.metrics.compressionSavings
      },
      cache: {
        size: this.cache.size || 'unknown',
        hitRate: 'native LRU cache active'
      }
    };

    this.sendToClient(clientId, {
      type: 'stats',
      data: stats
    });
  }

  runBenchmark(clientId) {
    console.log('🔥 Running WebSocket benchmarks...');

    const results = {};
    const iterations = 1000;

    // JSON processing benchmark
    const testMessage = {
      type: 'benchmark_message',
      data: {
        users: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}` })),
        timestamp: Date.now()
      }
    };

    const jsonStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const serialized = this.jsonProcessor.stringify(testMessage);
      this.jsonProcessor.parse(serialized);
    }
    const jsonEnd = performance.now();

    results.jsonProcessing = {
      operations: iterations * 2,
      time: (jsonEnd - jsonStart).toFixed(3) + 'ms',
      opsPerSecond: Math.floor((iterations * 2) / ((jsonEnd - jsonStart) / 1000))
    };

    // Cache benchmark
    const cacheStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.cache.set(`bench:${i}`, `value:${i}`);
      this.cache.get(`bench:${i}`);
    }
    const cacheEnd = performance.now();

    results.cache = {
      operations: iterations * 2,
      time: (cacheEnd - cacheStart).toFixed(3) + 'ms',
      opsPerSecond: Math.floor((iterations * 2) / ((cacheEnd - cacheStart) / 1000))
    };

    // Compression benchmark
    const largeMessage = JSON.stringify({
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        content: `This is message ${i} with some content to compress`.repeat(10)
      }))
    });

    const compressionStart = performance.now();
    for (let i = 0; i < 100; i++) {
      this.native.compress(Buffer.from(largeMessage));
    }
    const compressionEnd = performance.now();

    const compressionRatio = this.native.compress(Buffer.from(largeMessage)).length / largeMessage.length;

    results.compression = {
      operations: 100,
      time: (compressionEnd - compressionStart).toFixed(3) + 'ms',
      opsPerSecond: Math.floor(100 / ((compressionEnd - compressionStart) / 1000)),
      compressionRatio: (compressionRatio * 100).toFixed(1) + '%'
    };

    this.sendToClient(clientId, {
      type: 'benchmark_results',
      data: { benchmark: results }
    });
  }

  start(port = 8080) {
    // In a real implementation, this would use the native WebSocket module
    console.log(`🚀 Real-time WebSocket Server starting on port ${port}`);
    console.log(`📡 Native WebSocket module: ${this.native.webSocketInitialized ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`📊 Native modules: ${Object.keys(this.native).filter(k => k.includes('Initialized') && this.native[k]).length}/16 working`);

    // Simulate some connections for demo
    setTimeout(() => {
      console.log('📱 Demo: Simulating client connections...');
      this.handleConnection('client-1', { headers: { 'user-agent': 'Demo Client 1' } });
      this.handleConnection('client-2', { headers: { 'user-agent': 'Demo Client 2' } });

      // Simulate room joining
      this.handleJoinRoom('client-1', { roomId: 'general' });
      this.handleJoinRoom('client-2', { roomId: 'general' });

      // Simulate messages
      this.handleRoomMessage('client-1', { roomId: 'general', message: 'Hello from native WebSocket!' });

    }, 1000);

    console.log(`🌐 WebSocket server would be running with native acceleration`);
    console.log(`🔗 Features: Real-time messaging, room management, compression, caching`);
  }
}

// Start the server if run directly
if (require.main === module) {
  const server = new RealtimeWebSocketServer();
  server.initialize().then(success => {
    if (success) {
      server.setupWebSocketHandlers();
      server.start(8080);
    } else {
      console.error('Failed to start WebSocket server');
      process.exit(1);
    }
  });
}

module.exports = RealtimeWebSocketServer;
