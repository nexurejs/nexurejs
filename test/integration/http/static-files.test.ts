/**
 * Integration tests for the static file middleware, including path-traversal
 * protection.
 */

import { describe, test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Nexure } from '../../../src/core/nexure.js';
import { createStaticMiddleware } from '../../../src/middleware/static-files.js';

let staticRoot: string;

beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), 'nexure-static-'));
  writeFileSync(join(staticRoot, 'hello.txt'), 'static content');
});

afterAll(() => {
  rmSync(staticRoot, { recursive: true, force: true });
});

const openServers: Server[] = [];

afterEach(() => {
  while (openServers.length) {
    openServers.pop()?.close();
  }
});

async function start(): Promise<string> {
  const app = new Nexure({ logging: false });
  app.use(createStaticMiddleware({ root: staticRoot, fallthrough: false }));
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

describe('Static file middleware', () => {
  test('serves a file from the static root', async () => {
    const base = await start();
    const res = await fetch(`${base}/hello.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('static content');
  });

  test('rejects an encoded path-traversal attempt', async () => {
    // Encode the slashes too (%2f) so the whole segment is not recognized as a
    // dot-segment and normalized away by the URL parser before it reaches the
    // server's traversal check.
    const base = await start();
    const res = await fetch(`${base}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    expect(res.status).toBe(403);
  });

  test('responds 404 for a missing file', async () => {
    const base = await start();
    const res = await fetch(`${base}/no-such-file.txt`);
    expect(res.status).toBe(404);
  });
});
