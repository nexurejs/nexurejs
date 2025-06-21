# WebSocket Support

NexureJS provides high-performance WebSocket support with native acceleration, making it ideal for real-time applications like chat systems, live updates, gaming, and collaborative tools.

## Table of Contents

- [WebSocket Basics](#websocket-basics)
- [Server Setup](#server-setup)
- [Client Connection](#client-connection)
- [Message Handling](#message-handling)
- [Authentication](#authentication)
- [Room Management](#room-management)
- [Broadcasting](#broadcasting)
- [Native WebSocket Acceleration](#native-websocket-acceleration)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)
- [Production Deployment](#production-deployment)

## WebSocket Basics

### Basic WebSocket Server

```javascript
import { createApp } from 'nexurejs';

const app = createApp({
  websocket: {
    enabled: true,
    path: '/ws',
    compression: true,
    maxPayload: 1024 * 1024, // 1MB
    idleTimeout: 30000, // 30 seconds
    native: true // Enable native acceleration
  }
});

// WebSocket connection handler
app.ws('/chat', (ws, ctx) => {
  console.log('New WebSocket connection');

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to chat server'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Received:', message);

      // Echo the message back
      ws.send(JSON.stringify({
        type: 'echo',
        data: message
      }));
    } catch (error) {
      console.error('Invalid message format:', error);
    }
  });

  // Handle connection close
  ws.on('close', (code, reason) => {
    console.log(`Connection closed: ${code} - ${reason}`);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

await app.start(3000);
```

## Server Setup

### Advanced WebSocket Configuration

```javascript
const app = createApp({
  websocket: {
    enabled: true,

    // Multiple WebSocket paths
    paths: {
      '/chat': {
        compression: true,
        maxPayload: 1024 * 1024,
        idleTimeout: 30000
      },
      '/notifications': {
        compression: false,
        maxPayload: 64 * 1024,
        idleTimeout: 60000
      },
      '/game': {
        compression: true,
        maxPayload: 512 * 1024,
        idleTimeout: 10000,
        heartbeat: 5000
      }
    },

    // Global settings
    maxConnections: 10000,
    backpressure: 64 * 1024,
    compression: 'shared', // 'shared', 'dedicated', or false

    // Native acceleration
    native: {
      enabled: true,
      simd: true,
      bufferPool: true
    },

    // Security
    origins: ['https://myapp.com', 'https://localhost:3000'],
    subprotocols: ['chat-v1', 'notifications-v1']
  }
});
```

### Multiple WebSocket Endpoints

```javascript
// Chat WebSocket
app.ws('/chat', (ws, ctx) => {
  const userId = ctx.user?.id;
  const roomId = ctx.query.room || 'general';

  // Join room
  ws.join(roomId);

  // Broadcast user joined
  ws.to(roomId).emit('user-joined', {
    userId,
    username: ctx.user?.username,
    timestamp: new Date().toISOString()
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'chat-message':
        handleChatMessage(ws, message, roomId, userId);
        break;
      case 'typing':
        handleTyping(ws, message, roomId, userId);
        break;
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  });
});

// Notifications WebSocket
app.ws('/notifications', (ws, ctx) => {
  const userId = ctx.user?.id;

  if (!userId) {
    ws.close(1008, 'Authentication required');
    return;
  }

  // Subscribe to user notifications
  ws.join(`user:${userId}`);

  // Send pending notifications
  sendPendingNotifications(ws, userId);

  ws.on('message', (data) => {
    const message = JSON.parse(data);

    if (message.type === 'mark-read') {
      markNotificationAsRead(message.notificationId, userId);
    }
  });
});

// Real-time game updates
app.ws('/game/:gameId', (ws, ctx) => {
  const gameId = ctx.params.gameId;
  const playerId = ctx.user?.id;

  // Join game room
  ws.join(`game:${gameId}`);

  // Handle game events
  ws.on('message', (data) => {
    const event = JSON.parse(data);
    handleGameEvent(ws, event, gameId, playerId);
  });
});
```

## Client Connection

### JavaScript Client

```javascript
// Basic connection
const ws = new WebSocket('ws://localhost:3000/chat');

ws.onopen = () => {
  console.log('Connected to WebSocket server');

  // Send authentication
  ws.send(JSON.stringify({
    type: 'auth',
    token: localStorage.getItem('authToken')
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);

  switch (message.type) {
    case 'welcome':
      handleWelcome(message);
      break;
    case 'chat-message':
      displayChatMessage(message);
      break;
    case 'user-joined':
      showUserJoined(message);
      break;
    case 'error':
      handleError(message);
      break;
  }
};

ws.onclose = (event) => {
  console.log(`Connection closed: ${event.code} - ${event.reason}`);

  // Attempt to reconnect
  setTimeout(() => {
    connectWebSocket();
  }, 5000);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Send message
const sendMessage = (message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocket not connected');
  }
};
```

### Advanced Client with Reconnection

```javascript
class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      ...options
    };
    this.ws = null;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.messageQueue = [];
    this.listeners = new Map();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushMessageQueue();
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'pong') {
          return; // Heartbeat response
        }

        this.emit('message', message);
        this.emit(message.type, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
      this.stopHeartbeat();
      this.emit('disconnected', event);

      if (event.code !== 1000) { // Not a normal closure
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };
  }

  send(message) {
    if (this.isConnected()) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.connect();
      }, this.options.reconnectInterval);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
    }
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, this.options.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(listener);
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  close() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
  }
}

// Usage
const client = new WebSocketClient('ws://localhost:3000/chat');

client.on('connected', () => {
  console.log('Client connected');
});

client.on('chat-message', (message) => {
  displayMessage(message);
});

client.connect();
```

## Message Handling

### Message Types and Routing

```javascript
class WebSocketMessageHandler {
  constructor() {
    this.handlers = new Map();
  }

  register(type, handler) {
    this.handlers.set(type, handler);
  }

  handle(ws, message, context = {}) {
    const handler = this.handlers.get(message.type);

    if (handler) {
      try {
        return handler(ws, message, context);
      } catch (error) {
        console.error(`Error handling message type ${message.type}:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
          originalType: message.type
        }));
      }
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
    }
  }
}

// Create message handler
const messageHandler = new WebSocketMessageHandler();

// Register message handlers
messageHandler.register('chat-message', (ws, message, context) => {
  const { roomId, userId } = context;

  // Validate message
  if (!message.content || message.content.trim().length === 0) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Message content cannot be empty'
    }));
    return;
  }

  // Create chat message
  const chatMessage = {
    id: generateMessageId(),
    type: 'chat-message',
    content: sanitizeMessage(message.content),
    userId,
    username: context.username,
    roomId,
    timestamp: new Date().toISOString()
  };

  // Save to database
  saveChatMessage(chatMessage);

  // Broadcast to room
  ws.to(roomId).emit('chat-message', chatMessage);
});

messageHandler.register('typing', (ws, message, context) => {
  const { roomId, userId, username } = context;

  ws.to(roomId).emit('typing', {
    type: 'typing',
    userId,
    username,
    isTyping: message.isTyping,
    timestamp: new Date().toISOString()
  });
});

messageHandler.register('join-room', (ws, message, context) => {
  const { userId, username } = context;
  const { roomId } = message;

  // Leave current room
  if (context.currentRoom) {
    ws.leave(context.currentRoom);
  }

  // Join new room
  ws.join(roomId);
  context.currentRoom = roomId;

  // Notify room
  ws.to(roomId).emit('user-joined', {
    type: 'user-joined',
    userId,
    username,
    roomId,
    timestamp: new Date().toISOString()
  });

  // Send room info to user
  ws.send(JSON.stringify({
    type: 'room-joined',
    roomId,
    users: getRoomUsers(roomId),
    recentMessages: getRecentMessages(roomId, 50)
  }));
});

// Use in WebSocket handler
app.ws('/chat', (ws, ctx) => {
  const context = {
    userId: ctx.user?.id,
    username: ctx.user?.username,
    roomId: ctx.query.room || 'general'
  };

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      messageHandler.handle(ws, message, context);
    } catch (error) {
      console.error('Invalid message format:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
});
```

## Authentication

### JWT-Based WebSocket Authentication

```javascript
import jwt from 'jsonwebtoken';

const authenticateWebSocket = async (ws, ctx) => {
  try {
    // Get token from query parameter or header
    const token = ctx.query.token ||
                  ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ws.close(1008, 'Authentication required');
      return null;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUserById(decoded.userId);

    if (!user) {
      ws.close(1008, 'Invalid token');
      return null;
    }

    return user;
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    ws.close(1008, 'Authentication failed');
    return null;
  }
};

// WebSocket with authentication
app.ws('/secure-chat', async (ws, ctx) => {
  const user = await authenticateWebSocket(ws, ctx);

  if (!user) {
    return; // Connection already closed
  }

  // Store user info in WebSocket
  ws.user = user;
  ws.userId = user.id;

  // Continue with authenticated WebSocket logic
  ws.send(JSON.stringify({
    type: 'authenticated',
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  }));

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    // Handle authenticated messages
    handleAuthenticatedMessage(ws, message, user);
  });
});
```

### Session-Based Authentication

```javascript
import session from 'express-session';

// Session middleware for WebSocket upgrade
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
});

// Apply session middleware to WebSocket upgrade
app.on('upgrade', (request, socket, head) => {
  sessionMiddleware(request, {}, () => {
    // Session is now available in request.session
  });
});

app.ws('/session-chat', (ws, ctx) => {
  const session = ctx.request.session;

  if (!session.userId) {
    ws.close(1008, 'Not authenticated');
    return;
  }

  const userId = session.userId;
  ws.userId = userId;

  // Continue with session-authenticated logic
});
```

## Room Management

### Advanced Room System

```javascript
class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.userRooms = new Map(); // userId -> Set of roomIds
  }

  createRoom(roomId, options = {}) {
    if (this.rooms.has(roomId)) {
      return false;
    }

    this.rooms.set(roomId, {
      id: roomId,
      users: new Set(),
      metadata: options.metadata || {},
      maxUsers: options.maxUsers || 100,
      private: options.private || false,
      created: new Date(),
      lastActivity: new Date()
    });

    return true;
  }

  joinRoom(userId, roomId, ws) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.users.size >= room.maxUsers) {
      return { success: false, error: 'Room is full' };
    }

    // Add user to room
    room.users.add(userId);
    room.lastActivity = new Date();

    // Track user rooms
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId).add(roomId);

    // Join WebSocket room
    ws.join(roomId);

    return { success: true, room };
  }

  leaveRoom(userId, roomId, ws) {
    const room = this.rooms.get(roomId);

    if (room) {
      room.users.delete(userId);
      room.lastActivity = new Date();

      // Remove empty rooms
      if (room.users.size === 0 && !room.persistent) {
        this.rooms.delete(roomId);
      }
    }

    // Update user rooms
    const userRooms = this.userRooms.get(userId);
    if (userRooms) {
      userRooms.delete(roomId);
      if (userRooms.size === 0) {
        this.userRooms.delete(userId);
      }
    }

    // Leave WebSocket room
    ws.leave(roomId);
  }

  leaveAllRooms(userId, ws) {
    const userRooms = this.userRooms.get(userId);

    if (userRooms) {
      userRooms.forEach(roomId => {
        this.leaveRoom(userId, roomId, ws);
      });
    }
  }

  getRoomUsers(roomId) {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.users) : [];
  }

  getUserRooms(userId) {
    const userRooms = this.userRooms.get(userId);
    return userRooms ? Array.from(userRooms) : [];
  }

  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return null;
    }

    return {
      id: room.id,
      userCount: room.users.size,
      maxUsers: room.maxUsers,
      private: room.private,
      metadata: room.metadata,
      created: room.created,
      lastActivity: room.lastActivity
    };
  }

  listRooms() {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      userCount: room.users.size,
      maxUsers: room.maxUsers,
      private: room.private,
      metadata: room.metadata
    }));
  }
}

// Global room manager
const roomManager = new RoomManager();

// Create default rooms
roomManager.createRoom('general', { metadata: { name: 'General Chat' } });
roomManager.createRoom('random', { metadata: { name: 'Random' } });

// WebSocket with room management
app.ws('/rooms', (ws, ctx) => {
  const userId = ctx.user?.id;

  if (!userId) {
    ws.close(1008, 'Authentication required');
    return;
  }

  ws.on('message', (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'join-room':
        const joinResult = roomManager.joinRoom(userId, message.roomId, ws);

        if (joinResult.success) {
          ws.send(JSON.stringify({
            type: 'room-joined',
            roomId: message.roomId,
            room: roomManager.getRoomInfo(message.roomId)
          }));

          // Notify other users
          ws.to(message.roomId).emit('user-joined', {
            type: 'user-joined',
            userId,
            username: ctx.user.username,
            roomId: message.roomId
          });
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: joinResult.error
          }));
        }
        break;

      case 'leave-room':
        roomManager.leaveRoom(userId, message.roomId, ws);

        ws.send(JSON.stringify({
          type: 'room-left',
          roomId: message.roomId
        }));

        // Notify other users
        ws.to(message.roomId).emit('user-left', {
          type: 'user-left',
          userId,
          username: ctx.user.username,
          roomId: message.roomId
        });
        break;

      case 'list-rooms':
        ws.send(JSON.stringify({
          type: 'room-list',
          rooms: roomManager.listRooms()
        }));
        break;

      case 'create-room':
        const created = roomManager.createRoom(message.roomId, message.options);

        if (created) {
          ws.send(JSON.stringify({
            type: 'room-created',
            roomId: message.roomId
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Room already exists'
          }));
        }
        break;
    }
  });

  ws.on('close', () => {
    // Clean up user from all rooms
    roomManager.leaveAllRooms(userId, ws);
  });
});
```

## Broadcasting

### Efficient Broadcasting

```javascript
class BroadcastManager {
  constructor() {
    this.subscribers = new Map(); // channel -> Set of WebSockets
    this.userSubscriptions = new Map(); // userId -> Set of channels
  }

  subscribe(ws, channel, userId = null) {
    // Add to channel subscribers
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel).add(ws);

    // Track user subscriptions
    if (userId) {
      if (!this.userSubscriptions.has(userId)) {
        this.userSubscriptions.set(userId, new Set());
      }
      this.userSubscriptions.get(userId).add(channel);
    }

    // Store channel on WebSocket for cleanup
    if (!ws.channels) {
      ws.channels = new Set();
    }
    ws.channels.add(channel);
  }

  unsubscribe(ws, channel, userId = null) {
    const subscribers = this.subscribers.get(channel);
    if (subscribers) {
      subscribers.delete(ws);

      // Clean up empty channels
      if (subscribers.size === 0) {
        this.subscribers.delete(channel);
      }
    }

    // Remove from user subscriptions
    if (userId) {
      const userSubs = this.userSubscriptions.get(userId);
      if (userSubs) {
        userSubs.delete(channel);
        if (userSubs.size === 0) {
          this.userSubscriptions.delete(userId);
        }
      }
    }

    // Remove from WebSocket channels
    if (ws.channels) {
      ws.channels.delete(channel);
    }
  }

  broadcast(channel, message, excludeWs = null) {
    const subscribers = this.subscribers.get(channel);

    if (!subscribers) {
      return 0; // No subscribers
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    subscribers.forEach(ws => {
      if (ws !== excludeWs && ws.readyState === 1) { // OPEN
        try {
          ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error('Broadcast error:', error);
          // Remove dead connection
          this.unsubscribe(ws, channel);
        }
      }
    });

    return sentCount;
  }

  broadcastToUser(userId, message) {
    const userChannels = this.userSubscriptions.get(userId);

    if (!userChannels) {
      return 0;
    }

    let totalSent = 0;
    userChannels.forEach(channel => {
      totalSent += this.broadcast(channel, message);
    });

    return totalSent;
  }

  cleanupWebSocket(ws) {
    if (ws.channels) {
      ws.channels.forEach(channel => {
        this.unsubscribe(ws, channel);
      });
    }
  }

  getChannelStats() {
    const stats = {};
    this.subscribers.forEach((subscribers, channel) => {
      stats[channel] = subscribers.size;
    });
    return stats;
  }
}

// Global broadcast manager
const broadcastManager = new BroadcastManager();

// WebSocket with broadcasting
app.ws('/broadcast', (ws, ctx) => {
  const userId = ctx.user?.id;

  ws.on('message', (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'subscribe':
        broadcastManager.subscribe(ws, message.channel, userId);
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: message.channel
        }));
        break;

      case 'unsubscribe':
        broadcastManager.unsubscribe(ws, message.channel, userId);
        ws.send(JSON.stringify({
          type: 'unsubscribed',
          channel: message.channel
        }));
        break;

      case 'broadcast':
        const sentCount = broadcastManager.broadcast(
          message.channel,
          {
            type: 'broadcast-message',
            content: message.content,
            from: userId,
            timestamp: new Date().toISOString()
          },
          ws // Exclude sender
        );

        ws.send(JSON.stringify({
          type: 'broadcast-sent',
          channel: message.channel,
          sentTo: sentCount
        }));
        break;

      case 'get-stats':
        ws.send(JSON.stringify({
          type: 'channel-stats',
          stats: broadcastManager.getChannelStats()
        }));
        break;
    }
  });

  ws.on('close', () => {
    broadcastManager.cleanupWebSocket(ws);
  });
});

// API endpoint to broadcast to channel
app.post('/api/broadcast/:channel', authenticate, (ctx) => {
  const { channel } = ctx.params;
  const { message } = ctx.request.body;

  const sentCount = broadcastManager.broadcast(channel, {
    type: 'api-broadcast',
    content: message,
    from: 'system',
    timestamp: new Date().toISOString()
  });

  ctx.response.json({
    success: true,
    channel,
    sentTo: sentCount
  });
});
```

## Native WebSocket Acceleration

### Enable Native Acceleration

```javascript
const app = createApp({
  websocket: {
    native: {
      enabled: true,

      // SIMD acceleration for message processing
      simd: true,

      // Native buffer pooling
      bufferPool: {
        enabled: true,
        initialSize: 1024 * 1024, // 1MB
        maxSize: 10 * 1024 * 1024, // 10MB
        bufferSize: 64 * 1024 // 64KB per buffer
      },

      // Native compression
      compression: {
        enabled: true,
        algorithm: 'deflate', // 'deflate' or 'gzip'
        level: 6,
        threshold: 1024 // Compress messages larger than 1KB
      },

      // Native message parsing
      parser: {
        enabled: true,
        maxMessageSize: 1024 * 1024, // 1MB
        validateUtf8: true
      }
    }
  }
});
```

### Performance Monitoring

```javascript
// Get WebSocket performance metrics
app.get('/api/websocket/metrics', (ctx) => {
  const metrics = ctx.app.getWebSocketMetrics();

  ctx.response.json({
    connections: metrics.totalConnections,
    activeConnections: metrics.activeConnections,
    messagesPerSecond: metrics.messagesPerSecond,
    bytesPerSecond: metrics.bytesPerSecond,
    nativeAcceleration: metrics.nativeAcceleration,
    compressionRatio: metrics.compressionRatio,
    bufferPoolUsage: metrics.bufferPoolUsage
  });
});
```

## Performance Optimization

### Connection Pooling

```javascript
class WebSocketPool {
  constructor(maxConnections = 10000) {
    this.maxConnections = maxConnections;
    this.connections = new Map();
    this.connectionsByUser = new Map();
  }

  addConnection(ws, userId) {
    if (this.connections.size >= this.maxConnections) {
      ws.close(1013, 'Server overloaded');
      return false;
    }

    const connectionId = this.generateConnectionId();
    this.connections.set(connectionId, {
      ws,
      userId,
      connected: new Date(),
      lastActivity: new Date()
    });

    // Track user connections
    if (!this.connectionsByUser.has(userId)) {
      this.connectionsByUser.set(userId, new Set());
    }
    this.connectionsByUser.get(userId).add(connectionId);

    // Store connection ID on WebSocket
    ws.connectionId = connectionId;

    return true;
  }

  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);

    if (connection) {
      const { userId } = connection;
      this.connections.delete(connectionId);

      // Remove from user connections
      const userConnections = this.connectionsByUser.get(userId);
      if (userConnections) {
        userConnections.delete(connectionId);
        if (userConnections.size === 0) {
          this.connectionsByUser.delete(userId);
        }
      }
    }
  }

  getUserConnections(userId) {
    const connectionIds = this.connectionsByUser.get(userId);

    if (!connectionIds) {
      return [];
    }

    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter(conn => conn && conn.ws.readyState === 1);
  }

  generateConnectionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    return {
      totalConnections: this.connections.size,
      uniqueUsers: this.connectionsByUser.size,
      maxConnections: this.maxConnections
    };
  }
}

const wsPool = new WebSocketPool(10000);

app.ws('/pooled', (ws, ctx) => {
  const userId = ctx.user?.id;

  if (!wsPool.addConnection(ws, userId)) {
    return; // Connection rejected
  }

  ws.on('close', () => {
    wsPool.removeConnection(ws.connectionId);
  });

  // Handle messages...
});
```

### Message Batching

```javascript
class MessageBatcher {
  constructor(batchSize = 100, flushInterval = 100) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.batches = new Map(); // channel -> messages[]
    this.timers = new Map(); // channel -> timer
  }

  addMessage(channel, message) {
    if (!this.batches.has(channel)) {
      this.batches.set(channel, []);
    }

    const batch = this.batches.get(channel);
    batch.push(message);

    // Flush if batch is full
    if (batch.length >= this.batchSize) {
      this.flush(channel);
    } else if (!this.timers.has(channel)) {
      // Set timer for automatic flush
      const timer = setTimeout(() => {
        this.flush(channel);
      }, this.flushInterval);

      this.timers.set(channel, timer);
    }
  }

  flush(channel) {
    const batch = this.batches.get(channel);
    const timer = this.timers.get(channel);

    if (batch && batch.length > 0) {
      // Send batched messages
      broadcastManager.broadcast(channel, {
        type: 'message-batch',
        messages: batch,
        timestamp: new Date().toISOString()
      });

      // Clear batch
      this.batches.set(channel, []);
    }

    // Clear timer
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(channel);
    }
  }

  flushAll() {
    this.batches.forEach((_, channel) => {
      this.flush(channel);
    });
  }
}

const messageBatcher = new MessageBatcher(50, 100);

// Use message batching for high-frequency updates
app.ws('/high-frequency', (ws, ctx) => {
  ws.on('message', (data) => {
    const message = JSON.parse(data);

    if (message.type === 'game-update') {
      // Batch game updates instead of sending immediately
      messageBatcher.addMessage(`game:${message.gameId}`, {
        type: 'game-update',
        playerId: ctx.user.id,
        position: message.position,
        timestamp: new Date().toISOString()
      });
    }
  });
});
```

## Error Handling

### Comprehensive Error Handling

```javascript
const handleWebSocketError = (ws, error, context = {}) => {
  console.error('WebSocket error:', error, context);

  // Log error with context
  logError({
    type: 'websocket_error',
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });

  // Send error to client if connection is still open
  if (ws.readyState === 1) { // OPEN
    ws.send(JSON.stringify({
      type: 'error',
      message: 'An error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString()
    }));
  }

  // Close connection for severe errors
  if (error.severe) {
    ws.close(1011, 'Internal server error');
  }
};

app.ws('/error-handling', (ws, ctx) => {
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      // Validate message
      if (!message.type) {
        throw new Error('Message type is required');
      }

      // Handle message...

    } catch (error) {
      handleWebSocketError(ws, error, {
        userId: ctx.user?.id,
        messageData: data.toString()
      });
    }
  });

  ws.on('error', (error) => {
    handleWebSocketError(ws, error, {
      userId: ctx.user?.id,
      connectionId: ws.connectionId
    });
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: ${code} - ${reason}`);

    // Clean up resources
    if (ws.connectionId) {
      wsPool.removeConnection(ws.connectionId);
    }

    broadcastManager.cleanupWebSocket(ws);
  });
});
```

## Production Deployment

### Load Balancing with Sticky Sessions

```javascript
// nginx.conf
/*
upstream websocket_backend {
    ip_hash; # Sticky sessions
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;

    location /ws {
        proxy_pass http://websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout settings
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
*/
```

### Redis for Scaling

```javascript
import Redis from 'redis';

const redis = Redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

class RedisWebSocketAdapter {
  constructor() {
    this.publisher = redis.duplicate();
    this.subscriber = redis.duplicate();
    this.setupSubscriber();
  }

  setupSubscriber() {
    this.subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        // Broadcast to local connections
        broadcastManager.broadcast(channel, data.message, null);
      } catch (error) {
        console.error('Redis message error:', error);
      }
    });
  }

  async publish(channel, message) {
    await this.publisher.publish(channel, JSON.stringify({
      message,
      serverId: process.env.SERVER_ID,
      timestamp: new Date().toISOString()
    }));
  }

  async subscribe(channel) {
    await this.subscriber.subscribe(channel);
  }

  async unsubscribe(channel) {
    await this.subscriber.unsubscribe(channel);
  }
}

const redisAdapter = new RedisWebSocketAdapter();

// Broadcast across all servers
const globalBroadcast = async (channel, message) => {
  // Broadcast locally
  broadcastManager.broadcast(channel, message);

  // Broadcast to other servers via Redis
  await redisAdapter.publish(channel, message);
};
```

### Monitoring and Health Checks

```javascript
// Health check endpoint
app.get('/health/websocket', (ctx) => {
  const stats = wsPool.getStats();
  const channelStats = broadcastManager.getChannelStats();

  ctx.response.json({
    status: 'healthy',
    connections: stats.totalConnections,
    maxConnections: stats.maxConnections,
    utilization: (stats.totalConnections / stats.maxConnections * 100).toFixed(2) + '%',
    channels: Object.keys(channelStats).length,
    totalSubscribers: Object.values(channelStats).reduce((sum, count) => sum + count, 0),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// WebSocket metrics
app.get('/metrics/websocket', (ctx) => {
  const metrics = ctx.app.getWebSocketMetrics();

  ctx.response.json({
    connections: metrics.totalConnections,
    messagesPerSecond: metrics.messagesPerSecond,
    bytesPerSecond: metrics.bytesPerSecond,
    averageLatency: metrics.averageLatency,
    errorRate: metrics.errorRate,
    nativeAcceleration: metrics.nativeAcceleration
  });
});
```

## Next Steps

- [HTTP/2 Integration](http2.md) - Advanced HTTP/2 features
- [Streaming](streaming.md) - Data streaming patterns
- [Performance Optimization](../performance/optimization.md) - WebSocket performance
- [Production Deployment](../deployment/production.md) - Production WebSocket deployment
