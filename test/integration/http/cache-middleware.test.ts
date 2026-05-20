/**
 * Integration tests for the HTTP cache middleware and cache-control / ETag.
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import type { MiddlewareHandler } from '../../../src/middleware/middleware.js';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Get } from '../../../src/decorators/route-decorators.js';
import {
  createCacheMiddleware,
  createCacheControlMiddleware
} from '../../../src/cache/cache-middleware.js';

// Minimal in-memory cache manager (duck-typed to what the middleware uses).
function makeCacheManager() {
  const store = new Map<string, unknown>();
  return {
    createKey: (key: string, ns?: string) => (ns ? `${ns}:${key}` : key),
    get: async (key: string) => (store.has(key) ? store.get(key) : null),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    }
  } as any;
}

let hits = 0;

@Controller('/')
class CacheController {
  @Get('/ok')
  ok() {
    hits++;
    return { n: hits };
  }

  @Get('/boom')
  boom(): any {
    hits++;
    throw new Error('failure');
  }

  @Get('/page')
  page() {
    return { content: 'stable-content' };
  }
}

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
  hits = 0;
});

async function start(middleware: MiddlewareHandler): Promise<string> {
  const app = new Nexure({ logging: false });
  app.use(middleware);
  app.register(CacheController);
  const server = app.listen(0);
  openServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://localhost:${port}`;
}

describe('cache middleware', () => {
  test('serves a successful response from cache on the second request', async () => {
    const base = await start(createCacheMiddleware(makeCacheManager()));
    const first = await fetch(`${base}/ok`);
    const second = await fetch(`${base}/ok`);
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(second.headers.get('x-cache')).toBe('HIT');
    // The handler ran only once — the second response came from the cache.
    expect(hits).toBe(1);
  });

  test('does not cache an error response', async () => {
    const base = await start(createCacheMiddleware(makeCacheManager()));
    await fetch(`${base}/boom`);
    await fetch(`${base}/boom`);
    // Regression: a 500 must not be cached — the handler runs on every request.
    expect(hits).toBe(2);
  });
});

describe('cache-control / ETag middleware', () => {
  test('produces a stable, content-derived ETag and returns 304 on a match', async () => {
    const base = await start(createCacheControlMiddleware({ lastModified: false }));

    const first = await fetch(`${base}/page`);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    // Regression: identical content must yield the SAME ETag every time.
    const second = await fetch(`${base}/page`);
    expect(second.headers.get('etag')).toBe(etag);

    const conditional = await fetch(`${base}/page`, {
      headers: { 'If-None-Match': etag as string }
    });
    expect(conditional.status).toBe(304);
  });
});
