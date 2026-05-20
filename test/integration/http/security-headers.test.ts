/**
 * Integration tests for the security headers middleware.
 */

import { describe, test, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import type { MiddlewareHandler } from '../../../src/middleware/middleware.js';
import { Nexure } from '../../../src/core/nexure.js';
import { Controller, Get } from '../../../src/decorators/route-decorators.js';
import { createSecurityHeadersMiddleware } from '../../../src/security/security-headers.js';

@Controller('/')
class HeadersController {
  @Get('/x')
  x() {
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
  app.register(HeadersController);
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

describe('Security headers middleware', () => {
  test('applies standard security headers', async () => {
    const base = await start(createSecurityHeadersMiddleware());
    const res = await fetch(`${base}/x`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  test('uses the configured CSP directives', async () => {
    // Regression: the configured directives were declared into a shadowed
    // local and silently dropped, so the default policy was always emitted.
    const base = await start(
      createSecurityHeadersMiddleware({
        contentSecurityPolicy: {
          directives: {
            'default-src': ["'none'"],
            'img-src': ['https://cdn.example.com']
          },
          useNonce: false
        }
      })
    );
    const res = await fetch(`${base}/x`);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('img-src https://cdn.example.com');
  });
});
