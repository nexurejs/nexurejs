/**
 * Tests for the radix Router: route registration, matching, parameters,
 * method dispatch, and the pathname-keyed route cache.
 */

import { describe, test, expect } from 'vitest';
import { Router } from '../../../src/routing/router.js';
import { HttpMethod } from '../../../src/http/http-method.js';

const noop = async (): Promise<void> => {};

describe('Router', () => {
  test('matches a registered static route', () => {
    const router = new Router();
    router.addRoute(HttpMethod.GET, '/health', noop);
    expect(router.findRoute(HttpMethod.GET, '/health')).not.toBeNull();
  });

  test('returns null for an unregistered path or method', () => {
    const router = new Router();
    router.addRoute(HttpMethod.GET, '/health', noop);
    expect(router.findRoute(HttpMethod.GET, '/missing')).toBeNull();
    expect(router.findRoute(HttpMethod.POST, '/health')).toBeNull();
  });

  test('extracts named route parameters', () => {
    const router = new Router();
    router.addRoute(HttpMethod.GET, '/users/:id', noop);
    const match = router.findRoute(HttpMethod.GET, '/users/123');
    expect(match?.params).toEqual({ id: '123' });
  });

  test('dispatches the same path by HTTP method', () => {
    const router = new Router();
    router.get('/resource', noop);
    router.post('/resource', noop);
    expect(router.findRoute(HttpMethod.GET, '/resource')).not.toBeNull();
    expect(router.findRoute(HttpMethod.POST, '/resource')).not.toBeNull();
    expect(router.findRoute(HttpMethod.PUT, '/resource')).toBeNull();
  });

  test('matches a static segment in preference to a parameter segment', () => {
    const router = new Router();
    router.addRoute(HttpMethod.GET, '/users/:id', noop);
    router.addRoute(HttpMethod.GET, '/users/me', noop);
    expect(router.findRoute(HttpMethod.GET, '/users/me')?.params).toEqual({});
    expect(router.findRoute(HttpMethod.GET, '/users/42')?.params).toEqual({ id: '42' });
  });

  test('matches a wildcard route across any sub-path depth', () => {
    const router = new Router();
    router.addRoute(HttpMethod.GET, '/files/*', noop);
    expect(router.findRoute(HttpMethod.GET, '/files/readme.txt')).not.toBeNull();
    expect(router.findRoute(HttpMethod.GET, '/files/docs/guide/intro.md')).not.toBeNull();
  });

  test('caches by pathname so query strings share a single cache entry', () => {
    const router = new Router();
    router.addRoute(HttpMethod.GET, '/search', noop);

    router.findRoute(HttpMethod.GET, '/search?q=alpha'); // miss → insert
    router.findRoute(HttpMethod.GET, '/search?q=beta'); // cache hit
    router.findRoute(HttpMethod.GET, '/search?q=gamma'); // cache hit

    const stats = router.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.cacheSize).toBe(1);
  });
});
