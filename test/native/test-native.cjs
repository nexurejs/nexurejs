const path = require('path');

try {
  // Try to load the native module directly
  const nativeModule = require('./build/Release/nexurejs_native.node');
  console.log('Native module loaded successfully!');

  // Print out the available exports
  console.log('Available exports:', Object.keys(nativeModule));

} catch (e) {
  console.error('Error loading native module:', e);
}
