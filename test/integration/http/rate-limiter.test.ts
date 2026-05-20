/**
 * Integration tests for the token-bucket rate limiter.
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import type { MiddlewareHandler } from '../../../src/middleware/middleware.js';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Get } from '../../../src/decorators/route-decorators.js';
import { createRateLimiterMiddleware } from '../../../src/security/rate-limiter.js';

@Controller('/')
class PingController {
  @Get('/ping')
  ping() {
    return { ok: true };
  }
}

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
});

async function start(middleware: MiddlewareHandler): Promise<string> {
  const app = new Nexure({ logging: false });
  app.use(middleware);
  app.register(PingController);
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

describe('Rate limiter', () => {
  test('allows requests up to the limit, then responds 429', async () => {
    const base = await start(createRateLimiterMiddleware({ max: 5, windowMs: 60000 }));
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await fetch(`${base}/ping`)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
  });

  test('refills tokens over the configured window', async () => {
    // max=2 over 200ms → one token roughly every 100ms.
    const base = await start(createRateLimiterMiddleware({ max: 2, windowMs: 200 }));

    expect((await fetch(`${base}/ping`)).status).toBe(200);
    expect((await fetch(`${base}/ping`)).status).toBe(200);
    expect((await fetch(`${base}/ping`)).status).toBe(429); // bucket drained

    // Wait longer than the window so the bucket refills.
    await new Promise(resolve => setTimeout(resolve, 300));

    // Regression: the refill rate was 1000x too slow, so this stayed 429.
    expect((await fetch(`${base}/ping`)).status).toBe(200);
  });
});
