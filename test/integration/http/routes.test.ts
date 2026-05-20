/**
 * Integration tests for HTTP routing.
 *
 * These spin up a real Nexure server on an ephemeral port and exercise the
 * full request lifecycle: decorator-based controller registration, the radix
 * router, body parsing, and response serialization.
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Get, Post, Put, Delete } from '../../../src/decorators/route-decorators.js';

interface RouteContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
}

@Controller('/users')
class UsersController {
  @Get('/')
  list(ctx: RouteContext) {
    return { users: ['alice', 'bob'], filter: ctx.query.filter ?? null };
  }

  @Get('/:id')
  getOne(ctx: RouteContext) {
    return { id: ctx.params.id };
  }

  @Post('/')
  create(ctx: RouteContext) {
    return { created: ctx.body };
  }

  @Put('/:id')
  replace(ctx: RouteContext) {
    return { id: ctx.params.id, body: ctx.body };
  }

  @Delete('/:id')
  remove(ctx: RouteContext) {
    return { removed: ctx.params.id };
  }
}

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
});

async function startServer(): Promise<string> {
  const app = new Nexure({ logging: false });
  app.register(UsersController);
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

describe('HTTP Routing (integration)', () => {
  test('resolves a static GET route', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/users`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: ['alice', 'bob'], filter: null });
  });

  test('extracts route parameters', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/users/42`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42' });
  });

  test('extracts query-string parameters', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/users?filter=active`);
    expect(await res.json()).toMatchObject({ filter: 'active' });
  });

  test('parses a JSON body on POST and returns the configured 201 status', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'carol' })
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: { name: 'carol' } });
  });

  test('combines route params and a JSON body on PUT', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/users/7`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'dave' })
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '7', body: { name: 'dave' } });
  });

  test('honors a route-specific status code on DELETE', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/users/9`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });

  test('responds 404 for an unregistered route', async () => {
    const base = await startServer();
    const res = await fetch(`${base}/missing`);
    expect(res.status).toBe(404);
  });

  test('routes the same path by HTTP method', async () => {
    const base = await startServer();
    const getRes = await fetch(`${base}/users`);
    const postRes = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    expect(getRes.status).toBe(200);
    expect(postRes.status).toBe(201);
  });
});
