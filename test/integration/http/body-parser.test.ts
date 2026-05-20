/**
 * Integration tests for request body parsing (JSON and urlencoded).
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Post } from '../../../src/decorators/route-decorators.js';

interface RouteContext {
  body: any;
}

@Controller('/echo')
class EchoController {
  @Post('/')
  echo(ctx: RouteContext) {
    return { received: ctx.body ?? null };
  }
}

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
});

async function start(): Promise<string> {
  const app = new Nexure({ logging: false }).register(EchoController);
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

describe('Body parsing', () => {
  test('parses an application/json body', async () => {
    const base = await start();
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world', nested: [1, 2] })
    });
    expect(await res.json()).toEqual({ received: { hello: 'world', nested: [1, 2] } });
  });

  test('decodes "+" as a space in urlencoded bodies', async () => {
    const base = await start();
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=John+Doe'
    });
    expect(await res.json()).toEqual({ received: { name: 'John Doe' } });
  });

  test('preserves "=" characters inside urlencoded values', async () => {
    const base = await start();
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=abc=def&k=v'
    });
    expect(await res.json()).toEqual({ received: { token: 'abc=def', k: 'v' } });
  });
});
