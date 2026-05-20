/**
 * Tests for the UrlParser JS fallback.
 */

import { describe, test, expect } from 'vitest';
import { UrlParser } from '../../../src/native/index.js';

describe('UrlParser', () => {
  test('parses an absolute URL into its parts', () => {
    const result = new UrlParser().parse('https://example.com:8080/v1/users?active=true#top');
    expect(result.pathname).toBe('/v1/users');
    expect(result.search).toBe('active=true');
    expect(result.hash).toBe('top');
  });

  test('parses a relative URL (regression: previously returned all-empty)', () => {
    const result = new UrlParser().parse('/users/42?active=true#section');
    expect(result.pathname).toBe('/users/42');
    expect(result.search).toBe('active=true');
    expect(result.hash).toBe('section');
  });

  test('parseQueryString decodes "+" as a space', () => {
    const result = new UrlParser().parseQueryString('name=John+Doe&count=2');
    expect(result).toEqual({ name: 'John Doe', count: '2' });
  });

  test('formatQueryString round-trips special characters through parseQueryString', () => {
    const parser = new UrlParser();
    const input = { name: 'John Doe', q: 'a&b', tag: 'x=y' };
    // Regression: formatQueryString must percent-encode reserved characters,
    // otherwise '&' and '=' in values corrupt the query string on reparse.
    expect(parser.parseQueryString(parser.formatQueryString(input))).toEqual(input);
  });
});
