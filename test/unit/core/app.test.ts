/**
 * Tests for the Nexure application core: construction, registration,
 * the middleware pipeline, and error handling.
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Get } from '../../../src/decorators/route-decorators.js';

@Controller('/')
class RootController {
  @Get('/ping')
  ping() {
    return { ok: true };
  }

  @Get('/text')
  text(): string {
    return 'plain text response';
  }

  @Get('/boom')
  boom(): any {
    throw new Error('intentional failure');
  }
}

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
});

async function listen(app: Nexure): Promise<string> {
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

describe('Nexure application core', () => {
  test('constructs with default options', () => {
    expect(new Nexure()).toBeInstanceOf(Nexure);
  });

  test('constructs with custom options', () => {
    const app = new Nexure({ logging: false, prettyJson: true, globalPrefix: '/api' });
    expect(app).toBeInstanceOf(Nexure);
  });

  test('register() returns the app for chaining', () => {
    const app = new Nexure({ logging: false });
    expect(app.register(RootController)).toBe(app);
  });

  test('use() returns the app for chaining', () => {
    const app = new Nexure({ logging: false });
    expect(app.use(async (_req, _res, next) => { await next(); })).toBe(app);
  });

  test('serves a registered controller route', async () => {
    const app = new Nexure({ logging: false }).register(RootController);
    const base = await listen(app);
    const res = await fetch(`${base}/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('derives Content-Type from the handler return value', async () => {
    const app = new Nexure({ logging: false }).register(RootController);
    const base = await listen(app);
    const jsonRes = await fetch(`${base}/ping`);
    const textRes = await fetch(`${base}/text`);
    expect(jsonRes.headers.get('content-type')).toContain('application/json');
    expect(textRes.headers.get('content-type')).toContain('text/plain');
    expect(await textRes.text()).toBe('plain text response');
  });

  test('runs global middleware before the route handler', async () => {
    const app = new Nexure({ logging: false });
    app.use(async (_req, res, next) => {
      res.setHeader('X-Middleware', 'ran');
      await next();
    });
    app.register(RootController);
    const base = await listen(app);
    const res = await fetch(`${base}/ping`);
    expect(res.headers.get('x-middleware')).toBe('ran');
  });

  test('an uncaught handler error yields a 500 response', async () => {
    const app = new Nexure({ logging: false }).register(RootController);
    const base = await listen(app);
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(500);
  });

  test('a custom error handler overrides the default response', async () => {
    const app = new Nexure({ logging: false }).register(RootController);
    app.onError((_err, _req, res) => {
      res.statusCode = 418;
      res.end('handled');
    });
    const base = await listen(app);
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(418);
    expect(await res.text()).toBe('handled');
  });

  test('close() stops the server from accepting connections', async () => {
    const app = new Nexure({ logging: false }).register(RootController);
    const server = app.listen(0);
    openServers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    expect(server.listening).toBe(true);

    await new Promise<void>(resolve => app.close(() => resolve()));
    expect(server.listening).toBe(false);
  });
});
