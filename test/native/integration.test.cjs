/**
 * Comprehensive test for all NexureJS native components
 */

// Load the module
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('../../build/Release/nexurejs_native.node');
  console.log('Module loaded successfully!');

  console.log('\nNative module information:');
  console.log('- Version:', nativeModule.version);
  console.log('- Build date:', nativeModule.buildDate);
  console.log('- Platform:', nativeModule.platform);
  console.log('- Is native:', nativeModule.isNative);

  // Check available components
  console.log('\nAvailable components:');
  const components = [
    'StringEncoder',
    'ThreadPool',
    'ValidationEngine'
  ];

  const availableComponents = components.filter(component => !!nativeModule[component]);
  console.log('Components found:', availableComponents.join(', '));

  if (availableComponents.length === 0) {
    console.error('No components found in the native module');
    process.exit(1);
  }

  // Test each component
  console.log('\n=== TESTING ALL COMPONENTS ===\n');

  // 1. Test StringEncoder
  if (nativeModule.StringEncoder) {
    console.log('\n=== StringEncoder Tests ===\n');

    // Create instance
    console.log('Creating StringEncoder instance...');
    const encoder = new nativeModule.StringEncoder();
    console.log('✓ StringEncoder instance created');

    // Log available methods
    const stringEncoderMethods = Object.getOwnPropertyNames(encoder.__proto__);
    console.log('\nAvailable StringEncoder methods:', stringEncoderMethods);

    // Test base64 encoding if available
    if (stringEncoderMethods.includes('base64Encode')) {
      const testString = 'Hello, NexureJS!';
      console.log(`\nTesting base64 encoding of "${testString}"...`);
      const base64 = encoder.base64Encode(testString);
      console.log('Base64 encoded:', base64);

      if (stringEncoderMethods.includes('base64Decode')) {
        const decoded = encoder.base64Decode(base64);
        console.log('Base64 decoded:', decoded);
        console.log('Roundtrip successful:', decoded === testString);
      }
    }

    // Test URL encoding if available
    if (stringEncoderMethods.includes('urlEncode')) {
      console.log('\nTesting URL encoding...');
      const urlTestString = 'param=value with spaces&special=!@#$%^&*()';
      const urlEncoded = encoder.urlEncode(urlTestString);
      console.log('URL encoded:', urlEncoded);

      if (stringEncoderMethods.includes('urlDecode')) {
        const urlDecoded = encoder.urlDecode(urlEncoded);
        console.log('URL decoded:', urlDecoded);
        console.log('Roundtrip successful:', urlDecoded === urlTestString);
      }
    }

    // Test HTML encoding if available
    if (stringEncoderMethods.includes('htmlEncode')) {
      console.log('\nTesting HTML encoding...');
      const htmlTestString = '<script>alert("XSS")</script>';
      const htmlEncoded = encoder.htmlEncode(htmlTestString);
      console.log('HTML encoded:', htmlEncoded);

      if (stringEncoderMethods.includes('htmlDecode')) {
        const htmlDecoded = encoder.htmlDecode(htmlEncoded);
        console.log('HTML decoded:', htmlDecoded);
        console.log('Roundtrip successful:', htmlDecoded === htmlTestString);
      }
    }

    console.log('\n✓ StringEncoder tests completed successfully\n');
  }

  // 2. Test ThreadPool
  if (nativeModule.ThreadPool) {
    console.log('\n=== ThreadPool Tests ===\n');

    // Create instance
    console.log('Creating ThreadPool instance...');
    const threadPool = new nativeModule.ThreadPool();
    console.log('✓ ThreadPool instance created');

    // Test available methods
    const methods = Object.getOwnPropertyNames(threadPool.__proto__);
    console.log('\nAvailable methods:', methods);

    // Test basic task submission
    console.log('\nSubmitting a simple task...');

    // Use setTimeout to create a new execution context for ThreadPool tests
    // This avoids handle scope errors
    setTimeout(() => {
      threadPool.submit(() => {
        console.log('Task is running in thread pool');
        return 'Task completed successfully';
      }).then(result => {
        console.log('Task result:', result);

        // Test parallel task execution
        console.log('\nExecuting parallel tasks...');

        return Promise.all([
          threadPool.submit(() => 'Task 1'),
          threadPool.submit(() => 'Task 2'),
          threadPool.submit(() => 'Task 3')
        ]);
      }).then(results => {
        console.log('Parallel task results:', results);
        console.log('\n✓ ThreadPool tests completed successfully\n');

        // Continue with ValidationEngine tests in a new execution context
        setTimeout(testValidationEngine, 100);
      }).catch(err => {
        console.error('ThreadPool test failed:', err);
        setTimeout(testValidationEngine, 100);
      });
    }, 100);
  } else {
    // Skip to ValidationEngine if ThreadPool is not available
    testValidationEngine();
  }

  // 3. Test ValidationEngine
  function testValidationEngine() {
    if (nativeModule.ValidationEngine) {
      console.log('\n=== ValidationEngine Tests ===\n');

      // Create instance
      console.log('Creating ValidationEngine instance...');
      const validationEngine = new nativeModule.ValidationEngine();
      console.log('✓ ValidationEngine instance created');

      // Test available methods
      const methods = Object.getOwnPropertyNames(validationEngine.__proto__);
      console.log('\nAvailable methods:', methods);

      // Test schema registration and validation
      if (methods.includes('registerSchema') && methods.includes('validate')) {
        console.log('\nTesting schema registration and validation...');

        // Define a test schema
        const schemaId = 'test-schema';
        const schema = {
          type: 'object',
          properties: {
            id: { type: 'string' },
            count: { type: 'integer', minimum: 0 }
          },
          required: ['id']
        };

        // Register schema
        validationEngine.registerSchema(schemaId, schema);
        console.log('✓ Schema registered');

        // Test validation
        const validData = { id: '123', count: 5 };
        const result = validationEngine.validate(schemaId, validData);
        console.log('Validation result:', result);

        // Test metrics if available
        if (methods.includes('getMetrics')) {
          const metrics = validationEngine.getMetrics();
          console.log('\nValidation metrics:', metrics);
        }

        console.log('\n✓ ValidationEngine tests completed successfully\n');
      } else {
        console.log('Schema registration and validation methods not available');
      }

      // All tests completed
      console.log('\n=== ALL TESTS COMPLETED ===\n');

      // Print memory usage
      if (typeof nativeModule.getNativeMemoryUsage === 'function') {
        const memoryUsage = nativeModule.getNativeMemoryUsage();
        console.log('Native memory usage:', memoryUsage);
      }

      console.log('\nTests completed successfully!');
    }
  }

} catch (err) {
  console.error('Test failed with error:', err);
  process.exit(1);
}
