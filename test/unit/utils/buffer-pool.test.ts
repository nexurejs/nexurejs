/**
 * Tests for the BufferPool: sizing contract and reuse.
 */

import { describe, test, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { BufferPool } from '../../../src/utils/buffer-pool.js';

describe('BufferPool', () => {
  test('acquire returns a buffer of exactly the requested size', () => {
    const pool = new BufferPool();
    expect(pool.acquire(128).length).toBe(128);
  });

  test('a released buffer is reused on the next acquire of the same size', () => {
    const pool = new BufferPool({ trackAllocations: true });
    pool.release(pool.acquire(256));
    pool.acquire(256);
    expect(pool.getStats().reused).toBe(1);
  });

  test('acquire returns exactly the requested size even when a larger buffer is pooled', () => {
    const pool = new BufferPool();
    pool.release(Buffer.allocUnsafe(4096));
    // Regression: previously the whole 4096-byte buffer was returned.
    expect(pool.acquire(100).length).toBe(100);
  });
});
