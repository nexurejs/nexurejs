/**
 * Tests for HTTP utility helpers.
 */

import { describe, test, expect } from 'vitest';
import {
  bytes,
  parseUrlEncodedText,
  extractBaseContentType,
  hasBody
} from '../../../src/http/http-utils.js';

describe('http-utils', () => {
  describe('bytes', () => {
    test('passes numeric input through unchanged', () => {
      expect(bytes(2048)).toBe(2048);
    });

    test('parses "*b" unit suffixes', () => {
      expect(bytes('1kb')).toBe(1024);
      expect(bytes('2mb')).toBe(2 * 1024 * 1024);
    });

    test('parses bare unit suffixes (regression: "5k" was treated as 5 bytes)', () => {
      expect(bytes('5k')).toBe(5 * 1024);
      expect(bytes('1m')).toBe(1024 * 1024);
    });
  });

  describe('parseUrlEncodedText', () => {
    test('decodes "+" as a space and preserves "=" inside values', () => {
      expect(parseUrlEncodedText('name=John+Doe&token=a=b')).toEqual({
        name: 'John Doe',
        token: 'a=b'
      });
    });
  });

  describe('extractBaseContentType', () => {
    test('strips parameters from a content-type header', () => {
      expect(extractBaseContentType('application/json; charset=utf-8')).toBe('application/json');
    });
  });

  describe('hasBody', () => {
    test('is false for GET and true for POST with a content-length', () => {
      expect(hasBody({ method: 'GET', headers: {} })).toBe(false);
      expect(hasBody({ method: 'POST', headers: { 'content-length': '10' } })).toBe(true);
    });
  });
});
