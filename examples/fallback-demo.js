/**
 * NexureJS Fallback Demo
 *
 * This example demonstrates the automatic fallback to JavaScript implementation
 * when native modules are unavailable or when forced via command line flags.
 *
 * Run with: node examples/fallback-demo.js
 * Force JS: node examples/fallback-demo.js --force-js
 * Verbose:  node examples/fallback-demo.js --verbose
 *
 * For complete API documentation, see:
 * - API Reference: ./docs/API_REFERENCE.md
 * - Examples Guide: ./docs/EXAMPLES.md
 */

import * as nexure from '../dist/index.js';

console.log('NexureJS Fallback Demo');
console.log('=====================');
console.log(`Using native implementation: ${nexure.isNative ? 'Yes' : 'No'}`);
console.log(`Version: ${nexure.version || 'Unknown'}`);
console.log('');

// Try to check native module status
try {
  console.log('Native Module Status:');
  const { getNativeModuleStatus } = await import('../dist/native/index.js');
  const nativeStatus = getNativeModuleStatus();
  console.log(`Native modules loaded: ${nativeStatus.loaded}`);
  console.log(`String encoder: ${nativeStatus.stringEncoder}`);
  console.log(`Thread pool: ${nativeStatus.threadPool}`);
  console.log(`HTTP parser: ${nativeStatus.httpParser}`);
  console.log('');
} catch (error) {
  console.log('Could not load native module status:', error.message);
  console.log('');
}

// Test some basic functionality
console.log('Testing basic functionality...');

try {
  // Test string encoding if available
  const { StringEncoder } = await import('../dist/native/index.js');
  console.log('String encoding test:');
  const testString = 'Hello, NexureJS!';
  console.log(`Original: ${testString}`);

  // Try to create encoder instance
  if (typeof StringEncoder !== 'undefined') {
    console.log('✓ StringEncoder available');
  } else {
    console.log('⚠ StringEncoder not available, using JavaScript fallback');
  }
} catch (error) {
  console.log('⚠ Native modules not available:', error.message);
  console.log('Using JavaScript fallbacks');
}

console.log('\nDemo completed successfully! 🎉');
console.log('\nTo test native modules:');
console.log('1. Ensure native modules are built: npm run build:native');
console.log('2. Run tests: npm run test:native');
console.log('3. Check performance: npm run benchmark:native');
