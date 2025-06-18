/**
 * Test for simplified StringEncoder in nexurejs_simple
 */
const fs = require('fs');
const path = require('path');

// Load the module
try {
  console.log('Loading nexurejs_simple module...');
  const simpleModule = require('./build/Release/nexurejs_simple');
  console.log('Module loaded successfully!');
  console.log('Available exports:', Object.keys(simpleModule));
  console.log('Version:', simpleModule.version);
  console.log('Is simplified:', simpleModule.isSimplified);

  // Check if StringEncoder is available
  if (simpleModule.StringEncoder) {
    console.log('StringEncoder constructor found');

    try {
      console.log('Getting StringEncoder instance...');
      const encoderInstance = simpleModule.StringEncoder.getInstance();
      console.log('✓ Successfully got StringEncoder instance');

      // Try a simple encoding operation
      const testString = 'Hello, world!';
      const encoded = encoderInstance.urlEncode(testString);
      console.log(`urlEncode('${testString}') => '${encoded}'`);

      // Decode back
      const decoded = encoderInstance.urlDecode(encoded);
      console.log(`urlDecode('${encoded}') => '${decoded}'`);

      // Check round-trip
      console.log(`Round-trip match: ${testString === decoded ? '✓' : '✗'}`);

      // Get metrics
      const metrics = encoderInstance.getMetrics();
      console.log('Metrics:', metrics);

    } catch (err) {
      console.error('Error getting encoder instance:', err.message);
    }
  } else {
    console.error('StringEncoder not found in module');
    console.log('Available exports:', Object.keys(simpleModule));
  }
} catch (err) {
  console.error('Failed to load module:', err.message);
}
