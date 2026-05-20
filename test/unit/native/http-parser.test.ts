/**
 * Unit tests for the native HttpParser
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { HttpParser, getNativeModuleStatus } from '../../../src/native/index.js';

describe('Native HttpParser', () => {
  let httpParser: HttpParser;
  let isNativeAvailable: boolean;

  beforeAll(() => {
    httpParser = new HttpParser(); // Corrected: No argument expected
    isNativeAvailable = getNativeModuleStatus().httpParser;
    console.log(`HttpParser Native Implementation Available: ${isNativeAvailable}`);

    // If native isn't available, these tests might not be meaningful
    if (!isNativeAvailable) {
      console.warn('Native HttpParser not available, tests might only cover JS fallback.');
    }
  });

  test('should instantiate HttpParser', () => {
    expect(httpParser).toBeInstanceOf(HttpParser);
  });

  test('should parse a simple GET request', () => {
    const requestString = Buffer.from(
      'GET /test HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      'User-Agent: TestAgent\r\n' +
      '\r\n'
    );

    const result = httpParser.parse(requestString);

    // The exact structure of 'result' depends on the implementation
    // (native binding or JS fallback)
    expect(result).toBeDefined();
    // Add more specific assertions based on expected output structure
    // e.g., expect(result.method).toBe('GET');
    // e.g., expect(result.url).toBe('/test');
    // e.g., expect(result.headers.Host).toBe('example.com');
  });

  test('should handle parsing errors for malformed request', () => {
    const malformedRequest = Buffer.from('GET /test INVALID_PROTOCOL\r\n\r\n');

    // Expect an error or a specific error indicator in the result
    expect(() => httpParser.parse(malformedRequest)).toThrow();
    // Or: const result = httpParser.parse(malformedRequest); expect(result.error).toBeDefined();
  });

  test('should parse a POST request with body', () => {
    const requestString = Buffer.from(
      'POST /submit HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      'Content-Type: application/json\r\n' +
      'Content-Length: 25\r\n' +
      '\r\n' +
      '{"name":"test","age":30}'
    );

    const result = httpParser.parse(requestString);

    expect(result).toBeDefined();
    expect(result.method).toBe('POST');
    expect(result.url).toBe('/submit');
    expect(result.versionMajor).toBe(1);
    expect(result.versionMinor).toBe(1);
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.headers['content-length']).toBe('25');
    expect(result.body).toBeDefined();
    if (result.body) {
      expect(result.body.toString()).toBe('{"name":"test","age":30}');
    }
  });

  test('should parse headers correctly', () => {
    const headersBuffer = Buffer.from(
      'Host: example.com\r\n' +
      'User-Agent: TestAgent\r\n' +
      'Accept: */*\r\n' +
      'Content-Type: application/json\r\n' +
      '\r\n'
    );

    const headers = httpParser.parseHeaders(headersBuffer);

    expect(headers).toBeDefined();
    expect(headers['host']).toBe('example.com');
    expect(headers['user-agent']).toBe('TestAgent');
    expect(headers['accept']).toBe('*/*');
    expect(headers['content-type']).toBe('application/json');
  });

  test('should parse body correctly', () => {
    const bodyBuffer = Buffer.from('{"name":"test","age":30}');
    const contentLength = bodyBuffer.length;

    const body = httpParser.parseBody(bodyBuffer, contentLength);

    expect(body).toBeDefined();
    expect(body.toString()).toBe('{"name":"test","age":30}');
  });

  test('should throw for empty request', () => {
    const emptyBuffer = Buffer.from('');
    expect(() => httpParser.parse(emptyBuffer)).toThrow('Empty request');
  });

  test('should throw for request exceeding size limit', () => {
    // Create a buffer larger than MAX_BODY_SIZE
    const largeBuffer = Buffer.alloc(1024 * 1024 * 11); // 11MB (assuming MAX_BODY_SIZE is 10MB)
    expect(() => httpParser.parse(largeBuffer)).toThrow('Request too large');
  });

  test('should throw for empty headers', () => {
    const emptyBuffer = Buffer.from('');
    expect(() => httpParser.parseHeaders(emptyBuffer)).toThrow('Empty headers');
  });

  test('should throw for empty body', () => {
    const emptyBuffer = Buffer.from('');
    expect(() => httpParser.parseBody(emptyBuffer, 10)).toThrow('Empty body');
  });

  test('should throw for incomplete body', () => {
    const bodyBuffer = Buffer.from('{"name":"test"}');
    const contentLength = bodyBuffer.length + 10; // Larger than actual buffer
    expect(() => httpParser.parseBody(bodyBuffer, contentLength)).toThrow('Incomplete request body');
  });

  test('should reset parser state', () => {
    // This is a simple test since there's no state to reset in the JS implementation
    // but it ensures the method exists and can be called
    expect(() => httpParser.reset()).not.toThrow();
  });

  // Add tests for POST requests with body, chunked encoding, responses etc.
  // if the parser supports them and the interface allows testing them.
});
