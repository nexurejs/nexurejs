/**
 * Tests for the WebSocket decorators metadata handling.
 */

import 'reflect-metadata';
import { describe, test, expect } from 'vitest';
import {
  OnWsEvent,
  getWebSocketHandlers,
  WebSocketController,
  isWebSocketController
} from '../../../src/decorators/websocket-decorators.js';

describe('websocket-decorators', () => {
  test('registers handlers per class without polluting a parent class', () => {
    class Base {
      onConnect(): void {}
    }
    OnWsEvent('connection')(
      Base.prototype,
      'onConnect',
      Object.getOwnPropertyDescriptor(Base.prototype, 'onConnect')!
    );

    class Sub extends Base {
      onMessage(): void {}
    }
    OnWsEvent('message')(
      Sub.prototype,
      'onMessage',
      Object.getOwnPropertyDescriptor(Sub.prototype, 'onMessage')!
    );

    // Regression: decorating Sub must not append into Base's handler array.
    expect(getWebSocketHandlers(Base).map(h => h.event)).toEqual(['connection']);
    expect(getWebSocketHandlers(Sub).map(h => h.event)).toEqual(['message']);
  });

  test('isWebSocketController reflects the @WebSocketController decorator', () => {
    class WsCtrl {}
    WebSocketController()(WsCtrl);
    expect(isWebSocketController(WsCtrl)).toBe(true);

    class Plain {}
    expect(isWebSocketController(Plain)).toBe(false);
  });
});
