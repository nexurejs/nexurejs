/**
 * Tests for the CryptoService: hashing, random strings, and constant-time compare.
 */

import { describe, test, expect } from 'vitest';
import { crypto } from '../../../src/utils/crypto-service.js';

describe('CryptoService', () => {
  test('hash produces a stable sha256 hex digest', () => {
    const first = crypto.hash('hello');
    const second = crypto.hash('hello');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  test('randomString returns exactly the requested length for hex', () => {
    expect(crypto.randomString(32)).toHaveLength(32);
    expect(crypto.randomString(7)).toHaveLength(7);
  });

  test('randomString returns exactly the requested length for base64', () => {
    // Regression: previously generated too few bytes for base64 encodings.
    expect(crypto.randomString(32, 'base64')).toHaveLength(32);
    expect(crypto.randomString(40, 'base64url')).toHaveLength(40);
  });

  test('constantTimeCompare matches equal values and rejects unequal ones', () => {
    expect(crypto.constantTimeCompare('secret', 'secret')).toBe(true);
    expect(crypto.constantTimeCompare('secret', 'secres')).toBe(false);
    expect(crypto.constantTimeCompare('secret', 'a-longer-secret')).toBe(false);
  });

  test('uuid produces a v4-shaped identifier', () => {
    expect(crypto.uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
