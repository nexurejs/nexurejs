/**
 * Simple test for StringEncoder component
 */

// Loading the module with more detailed error handling
let nexurejs;
try {
  console.log('Attempting to load the native module...');
  nexurejs = require('./build/Release/nexurejs_native.node');
  console.log('Successfully loaded the native module');
} catch (err) {
  console.error('Failed to load the native module:', err);
  process.exit(1);
}

// Test StringEncoder if it exists
if (!nexurejs.StringEncoder) {
  console.error('StringEncoder component not found in the module');
  process.exit(1);
}

// Simple step-by-step testing with detailed logging
try {
  console.log('\nTesting StringEncoder...');

  // Step 1: Get static properties and methods
  console.log('StringEncoder static methods:');
  console.log(Object.getOwnPropertyNames(nexurejs.StringEncoder));

  // Step 2: Try to get an instance
  console.log('\nGetting StringEncoder instance...');
  const encoder = nexurejs.StringEncoder.getInstance();
  console.log('Successfully got StringEncoder instance');

  // Step 3: Verify instance methods
  console.log('\nStringEncoder instance methods:');
  console.log(Object.getOwnPropertyNames(nexurejs.StringEncoder.prototype));

  // Step 4: Try a simple encoding operation
  console.log('\nTesting Base64 encoding...');
  const original = 'Hello, world!';
  const encoded = encoder.base64Encode(original);
  console.log(`Original: "${original}"`);
  console.log(`Base64 encoded: "${encoded}"`);

  // Step 5: Test decoding
  console.log('\nTesting Base64 decoding...');
  const decoded = encoder.base64Decode(encoded);
  console.log(`Decoded back: "${decoded}"`);
  console.log(`Round-trip successful: ${original === decoded}`);

  // Step 6: Check metrics
  console.log('\nFetching metrics...');
  const metrics = encoder.getMetrics();
  console.log('Metrics:');
  console.log('- Base64 encoding operations:', metrics.base64EncodingCount);
  console.log('- Base64 decoding operations:', metrics.base64DecodingCount);
  console.log('- Total processing time (ms):', metrics.totalProcessingTimeMs);

  console.log('\nTest completed successfully!');
} catch (err) {
  console.error('\nTest failed with error:', err);
  process.exit(1);
}
