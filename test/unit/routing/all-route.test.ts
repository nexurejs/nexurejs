import { describe, test, expect, jest } from '@jest/globals';
import { Router, HttpMethod } from '../../../src/routing/router.js';

describe('Router ALL method', () => {
  test('registers handler for all HTTP methods', () => {
    const router = new Router();
    const handler = jest.fn(async () => 'ok');

    router.all('/test', handler);

    const methods = [
      HttpMethod.GET,
      HttpMethod.POST,
      HttpMethod.PUT,
      HttpMethod.DELETE,
      HttpMethod.PATCH,
      HttpMethod.OPTIONS,
      HttpMethod.HEAD
    ];

    for (const method of methods) {
      const match = router.findRoute(method, '/test');
      expect(match).not.toBeNull();
      expect(match!.route.handler).toBe(handler);
    }
  });
});
