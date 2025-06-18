/**
 * Test for StringEncoder htmlEncode method
 */

// Load the module
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('./build/Release/nexurejs_native.node');
  console.log('Module loaded successfully!');

  // Check if StringEncoder is available
  if (!nativeModule.StringEncoder) {
    console.error('StringEncoder component not found in the module');
    process.exit(1);
  }

  // Get StringEncoder instance
  const encoder = nativeModule.StringEncoder.getInstance();
  console.log('Got StringEncoder instance');

  // List all methods on the encoder
  console.log('\nAvailable methods on StringEncoder:');
  Object.getOwnPropertyNames(Object.getPrototypeOf(encoder)).forEach(method => {
    console.log(`- ${method}`);
  });

  // Test HTML encode if available
  if (typeof encoder.htmlEncode === 'function') {
    console.log('\nTesting HTML encoding:');
    const testString = 'Test <script>alert("XSS");</script> & other special chars';
    console.log(`Original: "${testString}"`);

    try {
      const encoded = encoder.htmlEncode(testString);
      console.log(`HTML encoded: "${encoded}"`);

      // Test decode if available
      if (typeof encoder.htmlDecode === 'function') {
        const decoded = encoder.htmlDecode(encoded);
        console.log(`Decoded back: "${decoded}"`);
        console.log(`Round-trip successful: ${testString === decoded}`);
      }
    } catch (err) {
      console.error('Error using htmlEncode:', err.message);
    }
  } else {
    console.error('htmlEncode method not found on StringEncoder');
  }

} catch (err) {
  console.error('Test failed with error:', err);
  process.exit(1);
}
