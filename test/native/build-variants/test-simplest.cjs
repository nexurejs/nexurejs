try {
  console.log('Attempting to load simplest native module...');
  const nativeModule = require('./build/Release/simplest.node');
  console.log('Simplest native module loaded!');
  console.log('Available exports:', Object.keys(nativeModule));

  // Test hello function
  if (typeof nativeModule.hello === 'function') {
    console.log('Testing hello function...');
    console.log('Result:', nativeModule.hello());
  } else {
    console.log('hello function not found in native module');
  }
} catch (err) {
  console.error('Failed to load simplest native module:', err);
}
