/**
 * Test for the minimal nexurejs module
 */
try {
  console.log('Loading nexurejs_minimal module...');
  const minimalModule = require('./build/Release/nexurejs_minimal');
  console.log('Module loaded successfully!');
  console.log('Available exports:', Object.keys(minimalModule));

  // Check basic info
  console.log('Version:', minimalModule.version);
  console.log('Is Minimal:', minimalModule.isMinimal);

  // Check StringEncoder
  if (minimalModule.StringEncoder) {
    console.log('\nStringEncoder constructor found');

    try {
      console.log('Getting StringEncoder instance...');
      const encoderInstance = minimalModule.StringEncoder.getInstance();
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

} catch (err) {
  console.error('Failed to load module:', err.message || err);
}
