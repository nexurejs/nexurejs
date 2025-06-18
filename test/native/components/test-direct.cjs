try {
  console.log('Attempting to load direct encoder module...');
  const nativeModule = require('./build/Release/direct_encoder.node');
  console.log('Direct encoder module loaded!');
  console.log('Available exports:', Object.keys(nativeModule));

  // Test direct encoder
  if (nativeModule.DirectEncoder) {
    console.log('Creating DirectEncoder instance...');
    const encoder = new nativeModule.DirectEncoder();
    console.log('Testing DirectEncoder functions...');
    const encoded = encoder.urlEncode('test string with spaces & special chars');
    console.log('URL Encoded:', encoded);
    console.log('URL Decoded:', encoder.urlDecode(encoded));
  } else {
    console.log('DirectEncoder not found in native module');
  }
} catch (err) {
  console.error('Failed to load direct encoder module:', err);
}
