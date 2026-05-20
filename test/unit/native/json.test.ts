/**
 * Unit tests for the native JsonProcessor
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { JsonProcessor, getNativeModuleStatus } from '../../../src/native/index.js';

describe('Native JsonProcessor', () => {
  let jsonProcessor: JsonProcessor;
  let isNativeAvailable: boolean;

  beforeAll(() => {
    jsonProcessor = new JsonProcessor();
    isNativeAvailable = getNativeModuleStatus().jsonProcessor;
    console.log(`JsonProcessor Native Implementation Available: ${isNativeAvailable}`);

    // If native isn't available, these tests might only cover JS fallback.
    if (!isNativeAvailable) {
      console.warn('Native JsonProcessor not available, tests might only cover JS fallback.');
    }
  });

  test('should parse a simple JSON string', () => {
    const jsonString = '{"name":"Test","value":123}';
    const result = jsonProcessor.parse(jsonString);
    expect(result).toEqual({ name: 'Test', value: 123 });
  });

  test('should stringify a simple object', () => {
    const obj = { name: 'Test', value: 123 };
    const result = jsonProcessor.stringify(obj);
    expect(result).toBe('{"name":"Test","value":123}');
  });

  test('should parse a JSON string with nested objects', () => {
    const jsonString = '{"user":{"name":"Test","age":30},"active":true}';
    const result = jsonProcessor.parse(jsonString);
    expect(result).toEqual({ user: { name: 'Test', age: 30 }, active: true });
  });

  test('should stringify an object with nested objects', () => {
    const obj = { user: { name: 'Test', age: 30 }, active: true };
    const result = jsonProcessor.stringify(obj);
    expect(result).toBe('{"user":{"name":"Test","age":30},"active":true}');
  });

  test('should parse a JSON array', () => {
    const jsonString = '[1,2,3,{"name":"Test"}]';
    const result = jsonProcessor.parse(jsonString);
    expect(result).toEqual([1, 2, 3, { name: 'Test' }]);
  });

  test('should stringify an array', () => {
    const arr = [1, 2, 3, { name: 'Test' }];
    const result = jsonProcessor.stringify(arr);
    expect(result).toBe('[1,2,3,{"name":"Test"}]');
  });

  test('should throw an error when parsing invalid JSON', () => {
    const invalidJson = '{invalid:json}';
    expect(() => jsonProcessor.parse(invalidJson)).toThrow();
  });

  test('should handle null and undefined values when stringifying', () => {
    const objWithNull = { name: null, value: undefined };
    const result = jsonProcessor.stringify(objWithNull);
    // JSON.stringify ignores undefined values and converts null to "null"
    expect(result).toBe('{"name":null}');
  });

  test('should parse a JSON string with special characters', () => {
    const jsonString = '{"specialChars":"\\n\\t\\r\\b\\f\\\\\\""}';
    const result = jsonProcessor.parse(jsonString);
    expect(result).toEqual({ specialChars: '\n\t\r\b\f\\"' });
  });

  test('should handle circular references gracefully', () => {
    const circularObj: any = { name: 'Circular' };
    circularObj.self = circularObj;

    // This should either throw or handle the circular reference
    expect(() => jsonProcessor.stringify(circularObj)).toThrow();
  });

  // Add more tests for JSON stream handling if supported by the interface
  // test('should parse a JSON stream', () => {...});
  // test('should stringify to a stream', () => {...});
});
