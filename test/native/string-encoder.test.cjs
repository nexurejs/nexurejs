// StringEncoder Test
const nativeModule = require('./build/Release/nexurejs_native.node');
const assert = require('assert');

async function testStringEncoder() {
  try {
    console.log('Starting StringEncoder Test...\n');

    // Check if the module is properly loaded
    console.log('Native module loaded:', !!nativeModule);
    console.log('Available exports:', Object.keys(nativeModule));

    // Create a StringEncoder instance
    if (!nativeModule.StringEncoder) {
      console.error('StringEncoder is not available in the native module');
      return;
    }

    const encoder = new nativeModule.StringEncoder();
    console.log('StringEncoder instance created');

    // Test base64 encoding/decoding
    console.log('\nTest 1: Base64 Encoding/Decoding');
    const testString = 'Hello, world! 123 #$%';
    const base64Encoded = encoder.base64Encode(testString);
    console.log(`- Original: "${testString}"`);
    console.log(`- Base64 Encoded: "${base64Encoded}"`);

    const base64Decoded = encoder.base64Decode(base64Encoded);
    console.log(`- Base64 Decoded: "${base64Decoded}"`);

    assert.strictEqual(base64Decoded, testString, 'Base64 roundtrip failed');

    // Test URL encoding/decoding
    console.log('\nTest 2: URL Encoding/Decoding');
    const urlString = 'https://example.com/?query=test value&param=special@chars!';
    const urlEncoded = encoder.urlEncode(urlString);
    console.log(`- Original: "${urlString}"`);
    console.log(`- URL Encoded: "${urlEncoded}"`);

    const urlDecoded = encoder.urlDecode(urlEncoded);
    console.log(`- URL Decoded: "${urlDecoded}"`);

    assert.strictEqual(urlDecoded, urlString, 'URL roundtrip failed');

    // Test HTML encoding/decoding
    console.log('\nTest 3: HTML Encoding/Decoding');
    const htmlString = '<div class="test">Hello & goodbye</div>';
    const htmlEncoded = encoder.htmlEncode(htmlString);
    console.log(`- Original: "${htmlString}"`);
    console.log(`- HTML Encoded: "${htmlEncoded}"`);

    const htmlDecoded = encoder.htmlDecode(htmlEncoded);
    console.log(`- HTML Decoded: "${htmlDecoded}"`);

    assert.strictEqual(htmlDecoded, htmlString, 'HTML roundtrip failed');

    // Test logging
    console.log('\nTest 4: Logging Configuration');
    console.log('- Setting log level to DEBUG (1)');
    encoder.setLogLevel(1);

    console.log('- Setting log file');
    encoder.setLogFile('./logs/encoder-test.log');

    // Get metrics
    console.log('\nTest 5: Performance Metrics');
    const metrics = encoder.getMetrics();
    console.log('- Metrics:', JSON.stringify(metrics, null, 2));

    // Reset metrics
    console.log('\nTest 6: Reset Metrics');
    encoder.resetMetrics();
    const resetMetrics = encoder.getMetrics();
    console.log('- Reset Metrics:', JSON.stringify(resetMetrics, null, 2));

    // Test the singleton instance
    console.log('\nTest 7: Singleton Instance');
    const instance = nativeModule.StringEncoder.getInstance();
    console.log('- Singleton instance retrieved');

    // Test encoding with singleton
    const singletonEncoded = instance.base64Encode('Singleton test');
    console.log(`- Singleton encoded: "${singletonEncoded}"`);

    console.log('\nStringEncoder Test completed successfully');
  } catch (error) {
    console.error('Test error:', error);
  }
}

testStringEncoder();
