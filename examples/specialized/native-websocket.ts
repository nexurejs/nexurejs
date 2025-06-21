import { Nexure } from '../src/core/nexure.js';
import { WebSocketController, OnConnect, OnMessage, OnJoinRoom, OnLeaveRoom, WebSocketContext } from '../src/decorators/websocket-decorators.js';

@WebSocketController()
class RealTimeController {
  private userCount: number = 0;

  @OnConnect()
  handleConnection(context: WebSocketContext) {
    this.userCount++;
    console.log(`New connection. Total users: ${this.userCount}`);

    // Send welcome message
    context.connection.send({
      type: 'welcome',
      data: {
        message: 'Welcome to the high-performance native WebSocket server!',
        userCount: this.userCount
      }
    });

    // Broadcast user count to all clients
    const wsServer = app.getWebSocketServer();
    wsServer?.broadcast({
      type: 'userCount',
      data: { count: this.userCount }
    });
  }

  @OnMessage()
  handleMessage(context: WebSocketContext) {
    console.log('Received message:', context.message);

    // Echo the message back
    context.connection.send({
      type: 'echo',
      data: context.message?.data
    });
  }

  @OnJoinRoom()
  handleJoinRoom(context: WebSocketContext) {
    const { connection, room } = context;
    console.log(`User joined room: ${room}`);

    const wsServer = app.getWebSocketServer();
    const roomSize = wsServer?.getRoomSize(room!) || 0;

    // Notify room about new user
    wsServer?.broadcastToRoom(room!, {
      type: 'roomUpdate',
      data: {
        message: 'A new user has joined the room',
        room,
        userCount: roomSize
      }
    });
  }

  @OnLeaveRoom()
  handleLeaveRoom(context: WebSocketContext) {
    const { room } = context;
    console.log(`User left room: ${room}`);

    const wsServer = app.getWebSocketServer();
    const roomSize = wsServer?.getRoomSize(room!) || 0;

    // Notify room about user leaving
    wsServer?.broadcastToRoom(room!, {
      type: 'roomUpdate',
      data: {
        message: 'A user has left the room',
        room,
        userCount: roomSize
      }
    });
  }
}

// Create the application with WebSocket and native modules enabled
const app = new Nexure({
  websocket: {
    enabled: true
  },
  performance: {
    nativeModules: true,
    nativeModuleConfig: {
      verbose: true
    }
  }
});

// Register the WebSocket controller
app.register(RealTimeController);

// Start the server
app.listen(3000, () => {
  console.log('Native WebSocket server running at http://localhost:3000');
  console.log('WebSocket endpoint available at ws://localhost:3000');

  // Print instructions
  console.log('\nTest with browser console:');
  console.log('const ws = new WebSocket("ws://localhost:3000");');
  console.log('ws.onmessage = (event) => console.log(JSON.parse(event.data));');
  console.log('ws.send(JSON.stringify({ type: "message", data: "Hello!" }));');
  console.log('ws.send(JSON.stringify({ type: "join", room: "test-room" }));');
});
