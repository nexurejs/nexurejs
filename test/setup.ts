/// <reference types="vitest/globals" />
/**
 * Global test setup for NexureJS
 * This file runs before all tests
 */

import { vi, beforeAll, afterAll } from 'vitest';
import { HttpParser, RadixRouter, JsonProcessor } from '../src/native/index.js';

// Set test environment variables
process.env.NODE_ENV = 'test';

// Global beforeAll hook - runs once before all tests
beforeAll(async () => {
  console.log('Starting NexureJS test suite...');

  // Initialize native modules if available
  try {
    const _httpParser = new HttpParser();
    console.log('Native HttpParser initialized');
  } catch (_error) {
    console.warn('Native HttpParser not available, tests might only cover JS fallback');
  }

  try {
    const _radixRouter = new RadixRouter();
    console.log('Native RadixRouter initialized');
  } catch (_error) {
    console.warn('Native RadixRouter not available, tests might only cover JS fallback');
  }

  try {
    const _jsonProcessor = new JsonProcessor();
    console.log('Native JsonProcessor initialized');
  } catch (_error) {
    console.warn('Native JsonProcessor not available, tests might only cover JS fallback');
  }
});

// Global afterAll hook - runs once after all tests
afterAll(() => {
  console.log('Completed NexureJS test suite');
  // Clean up global resources
});

// Add global mocks or test utilities
globalThis.mockRequest = (options = {}) => {
  return {
    headers: {},
    method: 'GET',
    url: '/',
    params: {},
    query: {},
    body: {},
    ...options
  };
};

globalThis.mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.getHeader = vi.fn().mockReturnValue('');
  res.headersSent = false;
  return res;
};

// Add type definitions for global test utilities
declare global {
  function mockRequest(options?: any): any;
  function mockResponse(): any;
}
