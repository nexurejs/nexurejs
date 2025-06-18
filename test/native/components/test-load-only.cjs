/**
 * Test for loading the main module only
 */
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('./build/Release/nexurejs_native');
  console.log('Module loaded successfully!');
  console.log('Available exports:', Object.keys(nativeModule));

  // Don't try to use any components, just print some basic info
  if (nativeModule.version) {
    console.log('Version:', nativeModule.version);
  }

  if (nativeModule.isNative) {
    console.log('Is Native:', nativeModule.isNative);
  }

  // Check if components are at least defined without trying to instantiate them
  console.log('\nComponents available:');
  if (nativeModule.StringEncoder) console.log('- StringEncoder');
  if (nativeModule.ThreadPool) console.log('- ThreadPool');
  if (nativeModule.ValidationEngine) console.log('- ValidationEngine');
  if (nativeModule.LRUCache) console.log('- LRUCache');
  if (nativeModule.CompressionEngine) console.log('- CompressionEngine');
  if (nativeModule.HttpParser) console.log('- HttpParser');
  if (nativeModule.JsonProcessor) console.log('- JsonProcessor');
  if (nativeModule.MiddlewareChain) console.log('- MiddlewareChain');
  if (nativeModule.RateLimiter) console.log('- RateLimiter');
  if (nativeModule.SchemaValidator) console.log('- SchemaValidator');

} catch (err) {
  console.error('Failed to load module:', err.message || err);
}
