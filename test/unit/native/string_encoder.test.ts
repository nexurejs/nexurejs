/**
 * Unit tests for the StringEncoder native module
 */

import { loadNativeBinding } from '../../../src/native/index.js';

describe('StringEncoder Native Module', () => {
  let nativeModule: any;
  let StringEncoder: any;

  beforeAll(() => {
    // Try to load the native module
    nativeModule = loadNativeBinding();

    // Skip all tests if native module is not available
    if (!nativeModule) {
      console.warn('Native module not available. Skipping StringEncoder tests.');
    } else {
      StringEncoder = nativeModule.StringEncoder;
    }
  });

  // Helper function to check if we should skip tests
  const skipIfNoNative = () => {
    if (!nativeModule) {
      return true;
    }
    return false;
  };

  describe('Initialization', () => {
    test('should be available in native module', () => {
      if (skipIfNoNative()) return;
      expect(StringEncoder).toBeDefined();
    });

    test('should be able to get an instance', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      expect(encoder).toBeDefined();
      expect(encoder.base64Encode).toBeInstanceOf(Function);
      expect(encoder.urlEncode).toBeInstanceOf(Function);
      expect(encoder.htmlEncode).toBeInstanceOf(Function);
    });
  });

  describe('Base64 Encoding/Decoding', () => {
    test('should encode strings to base64', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = 'Hello World';
      const expected = 'SGVsbG8gV29ybGQ=';
      const result = encoder.base64Encode(input);
      expect(result).toBe(expected);
    });

    test('should decode base64 to strings', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = 'SGVsbG8gV29ybGQ=';
      const expected = 'Hello World';
      const result = encoder.base64Decode(input);
      expect(result).toBe(expected);
    });

    test('should handle special characters in base64', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = 'Special ✓ Chars 🚀';
      const encoded = encoder.base64Encode(input);
      const decoded = encoder.base64Decode(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe('URL Encoding/Decoding', () => {
    test('should encode strings for URLs', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = 'Hello World?&=';
      const expected = 'Hello+World%3F%26%3D';
      const result = encoder.urlEncode(input);
      expect(result).toBe(expected);
    });

    test('should decode URL encoded strings', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = 'Hello+World%3F%26%3D';
      const expected = 'Hello World?&=';
      const result = encoder.urlDecode(input);
      expect(result).toBe(expected);
    });

    test('should handle special characters in URLs', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = 'Special ✓ Chars 🚀';
      const encoded = encoder.urlEncode(input);
      const decoded = encoder.urlDecode(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe('HTML Encoding/Decoding', () => {
    test('should encode HTML special characters', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = '<script>alert("XSS")</script>';
      const result = encoder.htmlEncode(input);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
    });

    test('should decode HTML entities', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';
      const expected = '<script>alert("XSS")</script>';
      const result = encoder.htmlDecode(input);
      expect(result).toBe(expected);
    });

    test('should handle round-trip HTML encoding/decoding', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();
      const input = '<div class="test">Special & chars</div>';
      const encoded = encoder.htmlEncode(input);
      const decoded = encoder.htmlDecode(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe('Performance Metrics', () => {
    test('should track encoding and decoding operations', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();

      // Reset metrics first
      encoder.resetMetrics();

      // Perform some operations
      encoder.base64Encode('test');
      encoder.base64Decode('dGVzdA==');
      encoder.urlEncode('test url');
      encoder.urlDecode('test+url');

      // Get metrics
      const metrics = encoder.getMetrics();

      // Verify metrics against the native StringEncoder's actual shape:
      // { totalEncodeCount, totalDecodeCount, totalTimeMs }.
      expect(metrics).toBeDefined();
      expect(metrics.totalEncodeCount).toBeGreaterThanOrEqual(2);
      expect(metrics.totalDecodeCount).toBeGreaterThanOrEqual(2);
      expect(typeof metrics.totalTimeMs).toBe('number');
    });

    test('should reset metrics', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();

      // Perform an operation to ensure metrics are not zero
      encoder.base64Encode('test');

      // Reset metrics
      encoder.resetMetrics();

      // Get metrics
      const metrics = encoder.getMetrics();

      // Verify metrics are reset
      expect(metrics.totalEncodeCount).toBe(0);
      expect(metrics.totalDecodeCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid base64 input', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();

      // This should throw or return an error result
      expect(() => {
        encoder.base64Decode('This is not valid base64!@#$');
      }).not.toThrow(); // We don't expect crash, but possibly an error result
    });

    test('should handle empty inputs', () => {
      if (skipIfNoNative()) return;
      const encoder = StringEncoder.getInstance();

      // Empty inputs should work without errors
      expect(() => {
        encoder.base64Encode('');
        encoder.urlEncode('');
        encoder.htmlEncode('');
      }).not.toThrow();

      const base64Result = encoder.base64Encode('');
      expect(base64Result).toBe('');
    });
  });

  describe('Static Methods', () => {
    test('should have static reset metrics method', () => {
      if (skipIfNoNative()) return;

      // Static method should be available on the class
      expect(StringEncoder.resetMetrics).toBeInstanceOf(Function);

      // Should not throw when called
      expect(() => {
        StringEncoder.resetMetrics();
      }).not.toThrow();
    });
  });
});
