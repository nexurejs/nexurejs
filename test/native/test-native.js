const path = require('path');

try {
  // Try to load the native module directly
  const nativeModule = require('./build/Release/nexurejs_native.node');
  console.log('Native module loaded successfully!');

  // Test string encoding
  if (nativeModule.StringEncoder) {
    const encoder = new nativeModule.StringEncoder();
    const encoded = encoder.urlEncode('test string with spaces & special chars');
    console.log('URL Encoded:', encoded);
    console.log('URL Decoded:', encoder.urlDecode(encoded));

    // Print metrics
    console.log('Metrics:', encoder.getMetrics());
  } else {
    console.log('StringEncoder not found in native module');
  }

  // Add more tests for other native features if needed

} catch (e) {
  console.error('Error loading native module:', e);
}
