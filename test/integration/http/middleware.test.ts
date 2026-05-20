/**
 * Integration tests for the middleware pipeline — route-level @Use middleware,
 * short-circuiting, and response mutation.
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Get, Use } from '../../../src/decorators/route-decorators.js';
import type { MiddlewareHandler } from '../../../src/middleware/middleware.js';

const requireToken: MiddlewareHandler = async (req, res, next) => {
  if (req.headers['x-token'] !== 'secret') {
    res.statusCode = 401;
    res.end('unauthorized');
    return; // do not call next() — short-circuit
  }
  await next();
};

const stamp: MiddlewareHandler = async (_req, res, next) => {
  res.setHeader('X-Stamped', 'yes');
  await next();
};

@Controller('/m')
class MiddlewareController {
  @Get('/open')
  open() {
    return { ok: true };
  }

  @Use(requireToken)
  @Get('/guarded')
  guarded() {
    return { secret: true };
  }

  @Use(stamp)
  @Get('/stamped')
  stamped() {
    return { ok: true };
  }
}

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
});

async function start(): Promise<string> {
  const app = new Nexure({ logging: false });
  app.register(MiddlewareController);
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

describe('Middleware pipeline', () => {
  test('a route without middleware is reached directly', async () => {
    const base = await start();
    const res = await fetch(`${base}/m/open`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('route middleware short-circuits when it does not call next()', async () => {
    const base = await start();
    const res = await fetch(`${base}/m/guarded`);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('unauthorized');
  });

  test('route middleware passes through to the handler when it calls next()', async () => {
    const base = await start();
    const res = await fetch(`${base}/m/guarded`, { headers: { 'x-token': 'secret' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ secret: true });
  });

  test('route middleware can mutate the response before the handler', async () => {
    const base = await start();
    const res = await fetch(`${base}/m/stamped`);
    expect(res.headers.get('x-stamped')).toBe('yes');
  });
});
