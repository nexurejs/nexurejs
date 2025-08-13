/**
 * Unit tests for the LRUCache native module
 */

import { loadNativeBinding } from '../../../src/native/index.js';

describe('LRUCache Native Module', () => {
  let nativeModule: any;
  let LRUCache: any;

  beforeAll(() => {
    nativeModule = loadNativeBinding();

    if (!nativeModule) {
      console.warn('Native module not available. Skipping LRUCache tests.');
    } else {
      LRUCache = nativeModule.LRUCache;
    }
  });

  // Helper to skip when the native module is missing
  const skipIfNoNative = () => {
    if (!nativeModule || !LRUCache) {
      return true;
    }
    return false;
  };

  test('should store and retrieve primitive values', () => {
    if (skipIfNoNative()) return;
    const cache = new LRUCache();
    cache.set('num', 42);
    cache.set('str', 'value');
    expect(cache.get('num')).toBe(42);
    expect(cache.get('str')).toBe('value');
  });
});

