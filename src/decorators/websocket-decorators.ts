export interface WebSocketMessage {
  type: string;
  data: any;
  room?: string;
}

export interface WebSocketConnection {
  send(message: string | object): void;
  sendBinary(data: Buffer): void;
  close(code?: number, reason?: string): void;
  joinRoom(roomName: string): void;
  leaveRoom(roomName: string): void;
  leaveAllRooms(): void;
  isInRoom(roomName: string): boolean;
  getRooms(): string[];
  isAlive: boolean;
  isAuthenticated: boolean;
  user?: any;
  data: Record<string, any>;
  lastHeartbeat?: number;
  ping?(): void;
}

export interface WebSocketContext {
  connection: WebSocketConnection;
  message?: WebSocketMessage;
  room?: string;
  binary?: Buffer;
  user?: any;
}

export interface WebSocketAuthContext extends WebSocketContext {
  token: string;
  success: boolean;
}

export interface WebSocketHandlerMetadata {
  event: string;
  handler: (context: WebSocketContext) => Promise<void> | void;
}

const WS_HANDLERS_KEY = Symbol('ws:handlers');
const WS_AUTH_HANDLER_KEY = Symbol('ws:auth:handler');

/**
 * Decorator for WebSocket event handlers
 * @param event The WebSocket event to handle
 */
export function OnWsEvent(event: string): MethodDecorator {
  return (target: any, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // Use getOwnMetadata (not getMetadata) and build a fresh array. getMetadata
    // walks the prototype chain, so decorating a subclass would otherwise
    // push into — and corrupt — the parent class's shared handler array.
    const ownHandlers: WebSocketHandlerMetadata[] =
      Reflect.getOwnMetadata(WS_HANDLERS_KEY, target.constructor) || [];

    Reflect.defineMetadata(
      WS_HANDLERS_KEY,
      [...ownHandlers, { event, handler: descriptor.value }],
      target.constructor
    );
    return descriptor;
  };
}

/**
 * Decorator for WebSocket controllers
 */
export function WebSocketController(): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata('websocket:controller', true, target);
    return target;
  };
}

/**
 * Decorator for WebSocket authentication handler
 */
export function WebSocketAuthHandler(): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(WS_AUTH_HANDLER_KEY, descriptor.value, target.constructor);
    return descriptor;
  };
}

/**
 * Get WebSocket handlers from a controller
 * @param controller The controller to get handlers from
 */
export function getWebSocketHandlers(controller: any): WebSocketHandlerMetadata[] {
  return Reflect.getMetadata(WS_HANDLERS_KEY, controller) || [];
}

/**
 * Get WebSocket authentication handler from a controller
 * @param controller The controller to get the auth handler from
 */
export function getWebSocketAuthHandler(controller: any): ((context: WebSocketAuthContext) => Promise<any> | any) | undefined {
  return Reflect.getMetadata(WS_AUTH_HANDLER_KEY, controller);
}

/**
 * Check if a class is a WebSocket controller
 * @param target The class to check
 */
export function isWebSocketController(target: any): boolean {
  return Reflect.getMetadata('websocket:controller', target) === true;
}

/**
 * Shorthand decorators for common WebSocket events
 */
export const OnConnect = (): MethodDecorator => OnWsEvent('connection');
export const OnDisconnect = (): MethodDecorator => OnWsEvent('disconnect');
export const OnMessage = (): MethodDecorator => OnWsEvent('message');
export const OnJoinRoom = (): MethodDecorator => OnWsEvent('room:join');
export const OnLeaveRoom = (): MethodDecorator => OnWsEvent('room:leave');

/**
 * Advanced WebSocket event decorators
 */
export const OnAuthenticated = (): MethodDecorator => OnWsEvent('authenticated');
export const OnAuthFailed = (): MethodDecorator => OnWsEvent('auth:failed');
export const OnHeartbeat = (): MethodDecorator => OnWsEvent('heartbeat');
export const OnTimeout = (): MethodDecorator => OnWsEvent('timeout');
export const OnError = (): MethodDecorator => OnWsEvent('error');
