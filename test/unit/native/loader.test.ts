/**
 * Unit tests for the native module loader
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { isNativeDisabled } from '../../../src/native/loader.js';

describe('Native Module Loader', () => {
  // Save original env variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env variables
    process.env = { ...originalEnv };
  });

  test('should report when native modules are disabled', () => {
    // Test with NEXUREJS_NATIVE_DISABLED set to true
    process.env.NEXUREJS_NATIVE_DISABLED = 'true';
    expect(isNativeDisabled()).toBe(true);

    // Test with NEXUREJS_LITE_MODE set to true
    process.env.NEXUREJS_NATIVE_DISABLED = '';
    process.env.NEXUREJS_LITE_MODE = 'true';
    expect(isNativeDisabled()).toBe(true);

    // Test with both disabled
    process.env.NEXUREJS_NATIVE_DISABLED = '';
    process.env.NEXUREJS_LITE_MODE = '';
    expect(isNativeDisabled()).toBe(false);
  });
});
