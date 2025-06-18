/**
 * Standalone encoder test
 * This script tests the standalone string encoder implementation
 */

try {
  console.log('Loading standalone encoder module...');
  const encoderModule = require('./build/Release/standalone_encoder');
  console.log('Module loaded successfully.');

  // Check if StringEncoder exists
  if (!encoderModule.StringEncoder) {
    console.error('StringEncoder not found in module');
    process.exit(1);
  }

  console.log('StringEncoder found in module');

  // Get StringEncoder instance
  const encoder = encoderModule.StringEncoder.getInstance();
  console.log('Got StringEncoder instance');

  // Test URL encoding
  const testString = "Hello, world! This is a test with special chars: ?&=+%";
  console.log(`\nTest string: "${testString}"`);

  // URL encoding
  console.log('\n--- Testing URL encoding ---');
  const urlEncoded = encoder.urlEncode(testString);
  console.log(`URL encoded: ${urlEncoded}`);

  // URL decoding
  const urlDecoded = encoder.urlDecode(urlEncoded);
  console.log(`URL decoded: ${urlDecoded}`);
  console.log(`URL round-trip matches: ${urlDecoded === testString}`);

  // Base64 encoding
  console.log('\n--- Testing Base64 encoding ---');
  const base64Encoded = encoder.base64Encode(testString);
  console.log(`Base64 encoded: ${base64Encoded}`);

  // Base64 decoding
  const base64Decoded = encoder.base64Decode(base64Encoded);
  console.log(`Base64 decoded: ${base64Decoded}`);
  console.log(`Base64 round-trip matches: ${base64Decoded === testString}`);

  // Get metrics
  console.log('\n--- Metrics ---');
  const metrics = encoder.getMetrics();
  console.log(JSON.stringify(metrics, null, 2));

  // Reset metrics
  console.log('\n--- Resetting metrics ---');
  encoder.resetMetrics();
  const resetMetrics = encoder.getMetrics();
  console.log(JSON.stringify(resetMetrics, null, 2));

  console.log('\nAll tests completed successfully!');

} catch (err) {
  console.error('Error in test:', err);
  process.exit(1);
}
