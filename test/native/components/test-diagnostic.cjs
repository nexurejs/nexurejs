/**
 * Test for the diagnostic main module
 */
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('./build/Release/nexurejs_native');
  console.log('Module loaded successfully!');

  // Print all diagnostic fields
  console.log('\nInitialization Diagnostics:');
  console.log('- Phase reached:', nativeModule.initializationPhase);
  console.log('- StringEncoder initialized:', nativeModule.stringEncoderInitialized || false);
  console.log('- ThreadPool initialized:', nativeModule.threadPoolInitialized || false);
  console.log('- ValidationEngine initialized:', nativeModule.validationEngineInitialized || false);
  console.log('- Initialization complete:', nativeModule.initializationComplete || false);

  // Check for specific error messages
  if (nativeModule.stringEncoderError) console.log('- StringEncoder error:', nativeModule.stringEncoderError);
  if (nativeModule.threadPoolError) console.log('- ThreadPool error:', nativeModule.threadPoolError);
  if (nativeModule.validationEngineError) console.log('- ValidationEngine error:', nativeModule.validationEngineError);

  console.log('\nAvailable exports:', Object.keys(nativeModule));

  // Test StringEncoder if it was initialized successfully
  if (nativeModule.StringEncoder && nativeModule.stringEncoderInitialized) {
    console.log('\nTesting StringEncoder:');
    try {
      console.log('Getting StringEncoder instance...');
      const encoderInstance = nativeModule.StringEncoder.getInstance();
      console.log('✓ Got StringEncoder instance');

      const testString = 'Hello, world!';
      const encoded = encoderInstance.urlEncode(testString);
      console.log(`urlEncode('${testString}') => '${encoded}'`);

      const decoded = encoderInstance.urlDecode(encoded);
      console.log(`urlDecode('${encoded}') => '${decoded}'`);

      console.log(`Round-trip match: ${testString === decoded ? '✓' : '✗'}`);
    } catch (err) {
      console.error('Error using StringEncoder:', err.message);
    }
  }

  // Test ThreadPool if it was initialized successfully
  if (nativeModule.ThreadPool && nativeModule.threadPoolInitialized) {
    console.log('\nTesting ThreadPool:');
    try {
      console.log('Getting ThreadPool instance...');
      const threadPool = nativeModule.ThreadPool.getInstance();
      console.log('✓ Got ThreadPool instance');
      console.log('Thread count:', threadPool.getThreadCount());
    } catch (err) {
      console.error('Error using ThreadPool:', err.message);
    }
  }

} catch (err) {
  console.error('Failed to load module:', err.message || err);
}
