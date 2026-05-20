/**
 * Unit tests for the native RadixRouter
 */

import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { RadixRouter, getNativeModuleStatus } from '../../../src/native/index.js';

describe('Native RadixRouter', () => {
  let router: RadixRouter;
  let isNativeAvailable: boolean;

  beforeAll(() => {
    isNativeAvailable = getNativeModuleStatus().radixRouter;
    console.log(`RadixRouter Native Implementation Available: ${isNativeAvailable}`);

    // If native isn't available, these tests might only cover JS fallback.
    if (!isNativeAvailable) {
      console.warn('Native RadixRouter not available, tests might only cover JS fallback.');
    }
  });

  beforeEach(() => {
    router = new RadixRouter();
  });

  test('should add a simple route', () => {
    const method = 'GET';
    const path = '/hello';
    const handler = { handlerId: 'handler_hello' };
    router.add(method, path, handler);

    const result = router.find(method, path);
    // Expect found: true on success
    expect(result).toEqual({ found: true, handler: handler, params: {} });
  });

  test('should add a route with parameters', () => {
    const method = 'GET';
    const path = '/users/:userId/posts/:postId';
    const handler = { handlerId: 'handler_user_post' };
    router.add(method, path, handler);

    const result = router.find(method, '/users/123/posts/abc');
    // Expect found: true on success
    expect(result).toEqual({
      found: true,
      handler: handler,
      params: { userId: '123', postId: 'abc' },
    });
  });

  test('should return specific object for non-existent route', () => {
    const result = router.find('GET', '/non/existent/route');
    expect(result).toEqual({ found: false, params: {} });
  });

  test('should return specific object for wrong method', () => {
    const postHandler = { handlerId: 'post_handler' };
    router.add('POST', '/only-post', postHandler);
    const result = router.find('GET', '/only-post');
    expect(result).toEqual({ found: false, params: {} });
  });

  test('should handle route conflicts (last added wins, usually)', () => {
    const method = 'PUT';
    const path = '/conflict';
    const handler1 = { handlerId: 'handler_conflict_1' };
    const handler2 = { handlerId: 'handler_conflict_2' };

    router.add(method, path, handler1);
    router.add(method, path, handler2);

    const result = router.find(method, path);
    // Expect found: true on success
    expect(result).toEqual({ found: true, handler: handler2, params: {} });
  });

  test('should find route with trailing slash if configured (depends on implementation)', () => {
    const method = 'GET';
    const path = '/trailing/';
    const handler = { handlerId: 'handler_trailing' };
    router.add(method, path, handler);

    const resultWithSlash = router.find(method, '/trailing/');
    const resultWithoutSlash = router.find(method, '/trailing');

    // Expect found: true on success for the exact match
    expect(resultWithSlash).toEqual({ found: true, handler: handler, params: {} });

    // Expect found: false for the non-match (assuming strict matching)
    expect(resultWithoutSlash).toEqual({ found: false, params: {} });
  });

  test('should handle multiple parameters in a route', () => {
    const method = 'GET';
    const path = '/api/:version/users/:userId/profile';
    const handler = { handlerId: 'handler_multi_params' };
    router.add(method, path, handler);

    const result = router.find(method, '/api/v1/users/123/profile');
    expect(result).toEqual({
      found: true,
      handler: handler,
      params: { version: 'v1', userId: '123' },
    });
  });

  test('should match exact paths correctly', () => {
    const method = 'GET';
    router.add(method, '/exact', { handlerId: 'exact' });
    router.add(method, '/exact/path', { handlerId: 'exactPath' });

    const result1 = router.find(method, '/exact');
    const result2 = router.find(method, '/exact/path');

    expect(result1).toEqual({ found: true, handler: { handlerId: 'exact' }, params: {} });
    expect(result2).toEqual({ found: true, handler: { handlerId: 'exactPath' }, params: {} });
  });

  test('should handle multiple HTTP methods for the same path', () => {
    const path = '/multi-method';
    const getHandler = { handlerId: 'get_handler' };
    const postHandler = { handlerId: 'post_handler' };
    const putHandler = { handlerId: 'put_handler' };

    router.add('GET', path, getHandler);
    router.add('POST', path, postHandler);
    router.add('PUT', path, putHandler);

    const getResult = router.find('GET', path);
    const postResult = router.find('POST', path);
    const putResult = router.find('PUT', path);

    expect(getResult).toEqual({ found: true, handler: getHandler, params: {} });
    expect(postResult).toEqual({ found: true, handler: postHandler, params: {} });
    expect(putResult).toEqual({ found: true, handler: putHandler, params: {} });
  });

  test('should handle removing routes correctly', () => {
    const method = 'DELETE';
    const path = '/removable';
    const handler = { handlerId: 'removable_handler' };

    router.add(method, path, handler);

    // Verify route exists
    const resultBefore = router.find(method, path);
    expect(resultBefore).toEqual({ found: true, handler: handler, params: {} });

    // Remove the route
    const removed = router.remove(method, path);
    expect(removed).toBe(true);

    // Verify route no longer exists
    const resultAfter = router.find(method, path);
    expect(resultAfter).toEqual({ found: false, params: {} });
  });

  test('should handle removing non-existent routes', () => {
    const removed = router.remove('GET', '/non-existent');
    expect(removed).toBe(false);
  });

  // Add tests for wildcard routes (*), different HTTP methods if supported by interface, etc.
});
