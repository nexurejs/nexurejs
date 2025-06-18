/**
 * Test for main NexureJS native module
 */
const fs = require('fs');
const path = require('path');

// Load the module
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('./build/Release/nexurejs_native');
  console.log('Module loaded successfully!');
  console.log('Available exports:', Object.keys(nativeModule));
  console.log('Version:', nativeModule.version);
  console.log('Is Native:', nativeModule.isNative);
  console.log('Build Date:', nativeModule.buildDate);
  console.log('Platform:', nativeModule.platform);

  // Check if StringEncoder is available
  if (nativeModule.StringEncoder) {
    console.log('StringEncoder constructor found');

    try {
      console.log('Getting StringEncoder instance...');
      const encoderInstance = nativeModule.StringEncoder.getInstance();
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
      console.error('Error using StringEncoder:', err.message);
    }
  } else {
    console.error('StringEncoder not found in module');
  }

  // Check if ThreadPool is available
  if (nativeModule.ThreadPool) {
    console.log('\nThreadPool constructor found');

    try {
      console.log('Getting ThreadPool instance...');
      const threadPool = nativeModule.ThreadPool.getInstance();
      console.log('✓ Successfully got ThreadPool instance');

      console.log('Thread count:', threadPool.getThreadCount());

    } catch (err) {
      console.error('Error using ThreadPool:', err.message);
    }
  } else {
    console.error('ThreadPool not found in module');
  }

} catch (err) {
  console.error('Failed to load module:', err.message);
}
