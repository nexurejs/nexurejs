/**
 * Minimal test for NexureJS native module
 * Just loads the module and checks if components exist
 */

// Attempt to load the native module
let nexurejs;
try {
  console.log('Attempting to load the native module...');
  nexurejs = require('./build/Release/nexurejs_native.node');
  console.log('Successfully loaded the native module');

  // Print what's in the module
  console.log('\nExported components:');
  Object.keys(nexurejs).forEach(key => {
    console.log(`- ${key}`);
  });

  // Check for specific components
  if (nexurejs.StringEncoder) {
    console.log('\nStringEncoder exists in the module');

    // List the methods on StringEncoder
    console.log('StringEncoder static methods:');
    Object.keys(nexurejs.StringEncoder).forEach(key => {
      console.log(`- ${key}`);
    });

    // Don't try to call getInstance() yet
    console.log('StringEncoder instance methods would be available via getInstance()');
  } else {
    console.log('StringEncoder not found in the module');
  }

  if (nexurejs.ThreadPool) {
    console.log('\nThreadPool exists in the module');

    // List the methods on ThreadPool
    console.log('ThreadPool static methods:');
    Object.keys(nexurejs.ThreadPool).forEach(key => {
      console.log(`- ${key}`);
    });

    // Don't try to call getInstance() yet
    console.log('ThreadPool instance methods would be available via getInstance()');
  } else {
    console.log('ThreadPool not found in the module');
  }

  console.log('\nModule inspection complete. Next steps would be to create instances and use them.');

} catch (err) {
  console.error('Failed to load or inspect the native module:', err);
}
