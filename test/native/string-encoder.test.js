// StringEncoder Test Suite
import { StringEncoder } from './build/Release/nexurejs_native.node';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

// Configuration
const LOG_DIR = './logs';
const LOG_FILE = path.join(LOG_DIR, 'string-encoder-test.log');

// Create log directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Test data
const TEST_STRINGS = [
  'Hello, world!',
  'Special chars: !@#$%^&*()_+{}:"<>?|\\][;\',./`~',
  'Unicode: 你好世界 αβγδε こんにちは ⺟∆∇√∫',
  'Empty string: ',
  'Very large string: ' + 'x'.repeat(10000)
];

// Start Test Suite
console.log('Starting StringEncoder Test Suite...\n');

async function runTests() {
  try {
    // Create StringEncoder
    console.log('Creating StringEncoder instance...');
    const encoder = new StringEncoder();

    // Configure logging
    console.log('Configuring logging...');
    encoder.setLogLevel(0); // TRACE level
    encoder.setLogFile(LOG_FILE);

    // Test Base64 encoding/decoding
    console.log('\nTest 1: Base64 Encoding/Decoding');
    for (let i = 0; i < TEST_STRINGS.length; i++) {
      const original = TEST_STRINGS[i];
      const encoded = encoder.base64Encode(original);
      const decoded = encoder.base64Decode(encoded);

      console.log(`- String ${i+1}: "${truncateString(original)}" -> ${truncateString(encoded)} -> "${truncateString(decoded)}"`);
      assert.strictEqual(decoded, original, `Base64 round trip failed for string ${i+1}`);
    }

    // Test URL encoding/decoding
    console.log('\nTest 2: URL Encoding/Decoding');
    for (let i = 0; i < TEST_STRINGS.length; i++) {
      const original = TEST_STRINGS[i];
      const encoded = encoder.urlEncode(original);
      const decoded = encoder.urlDecode(encoded);

      console.log(`- String ${i+1}: "${truncateString(original)}" -> ${truncateString(encoded)} -> "${truncateString(decoded)}"`);
      assert.strictEqual(decoded, original, `URL round trip failed for string ${i+1}`);
    }

    // Test HTML encoding/decoding
    console.log('\nTest 3: HTML Encoding/Decoding');
    for (let i = 0; i < TEST_STRINGS.length; i++) {
      const original = TEST_STRINGS[i];
      const encoded = encoder.htmlEncode(original);
      const decoded = encoder.htmlDecode(encoded);

      console.log(`- String ${i+1}: "${truncateString(original)}" -> ${truncateString(encoded)} -> "${truncateString(decoded)}"`);
      assert.strictEqual(decoded, original, `HTML round trip failed for string ${i+1}`);
    }

    // Test error handling
    console.log('\nTest 4: Error Handling');
    try {
      // This should throw an error - passing a number instead of a string
      encoder.base64Encode(123);
      console.log('- Error handling test FAILED: Expected an error but none was thrown');
    } catch (error) {
      console.log(`- Error handling test PASSED: ${error.message}`);
      console.log(`- Error type: ${error.errorType}, Retryable: ${error.retryable}`);
      console.log(`- Operation: ${error.operation}, Timestamp: ${error.timestamp}`);
    }

    // Test large batch of strings
    console.log('\nTest 5: Performance Test (Large Batch)');
    const BATCH_SIZE = 1000;
    const testString = 'Performance test string with some variety: 123ABC!@#あいう';

    console.log(`- Encoding/decoding ${BATCH_SIZE} strings...`);
    console.time('Batch processing');

    for (let i = 0; i < BATCH_SIZE; i++) {
      const encoded = encoder.base64Encode(testString);
      const decoded = encoder.base64Decode(encoded);
      assert.strictEqual(decoded, testString);
    }

    console.timeEnd('Batch processing');

    // Check metrics
    console.log('\nEncoder Metrics:');
    const metrics = encoder.getMetrics();
    console.log(JSON.stringify(metrics, null, 2));

    // Verify metrics
    assert(metrics.base64EncodingCount >= BATCH_SIZE, 'Base64 encoding count should match batch size');
    assert(metrics.base64DecodingCount >= BATCH_SIZE, 'Base64 decoding count should match batch size');

    console.log('\nTest suite completed successfully');
    console.log(`Detailed logs available at: ${LOG_FILE}`);

  } catch (error) {
    console.error('Test suite error:', error);
  }
}

// Helper function to truncate long strings for display
function truncateString(str, maxLength = 50) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

runTests();
