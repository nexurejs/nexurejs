/**
 * Tests for the request object pool.
 */

import { describe, test, expect } from 'vitest';
import { IncomingMessage } from 'node:http';
import { RequestPool } from '../../../src/http/request-pool.js';

describe('RequestPool', () => {
  test('acquire returns an IncomingMessage', () => {
    const pool = new RequestPool({ useNative: false });
    expect(pool.acquire()).toBeInstanceOf(IncomingMessage);
  });

  test('release resets and pools a request without throwing', () => {
    const pool = new RequestPool({ useNative: false });
    const req = pool.acquire();
    expect(() => pool.release(req)).not.toThrow();
    // The released object is returned to the pool and reused.
    expect(pool.acquire()).toBe(req);
  });

  test('release clears the request state for reuse', () => {
    const pool = new RequestPool({ useNative: false });
    const req = pool.acquire();
    req.url = '/stale';
    req.method = 'DELETE';
    pool.release(req);
    const reused = pool.acquire();
    expect(reused.url).toBe('');
    expect(reused.method).toBe('');
  });
});
