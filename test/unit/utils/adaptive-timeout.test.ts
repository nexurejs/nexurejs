/**
 * Tests for the AdaptiveTimeoutManager timeout calculation.
 */

import { describe, test, expect } from 'vitest';
import { AdaptiveTimeoutManager } from '../../../src/utils/adaptive-timeout.js';

describe('AdaptiveTimeoutManager', () => {
  test('clamps the calculated timeout within [minTimeout, maxTimeout]', () => {
    const manager = new AdaptiveTimeoutManager({
      adaptToLoad: false,
      minTimeout: 1000,
      maxTimeout: 5000,
      baseTimeout: 2000
    });
    const timeout = manager.calculateTimeout({ size: 0 });
    expect(timeout).toBeGreaterThanOrEqual(1000);
    expect(timeout).toBeLessThanOrEqual(5000);
    manager.dispose();
  });

  test('a larger payload yields a longer timeout', () => {
    const manager = new AdaptiveTimeoutManager({ adaptToLoad: false });
    const small = manager.calculateTimeout({ size: 1024 });
    const large = manager.calculateTimeout({ size: 10 * 1024 * 1024 });
    expect(large).toBeGreaterThan(small);
    manager.dispose();
  });

  test('recordProcessingTime ignores zero-size or zero-duration samples', () => {
    const manager = new AdaptiveTimeoutManager({ adaptToLoad: false });
    manager.recordProcessingTime({
      size: 0,
      contentType: 'application/json',
      operation: 'parse',
      duration: 5
    });
    manager.recordProcessingTime({
      size: 100,
      contentType: 'application/json',
      operation: 'parse',
      duration: 0
    });
    expect(manager.getStats().global.totalSamples).toBe(0);
    manager.dispose();
  });
});
