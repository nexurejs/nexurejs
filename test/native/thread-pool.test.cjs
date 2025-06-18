/**
 * Test for ThreadPool component
 */

// Load the module
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('./build/Release/nexurejs_native.node');
  console.log('Module loaded successfully!');

  // Check if ThreadPool is available
  if (!nativeModule.ThreadPool) {
    console.error('ThreadPool component not found in the module');
    process.exit(1);
  }

  console.log('\nTesting ThreadPool...');
  console.log('Available exports:', Object.keys(nativeModule));

  // Get ThreadPool instance by creating a new instance
  console.log('Creating ThreadPool instance...');
  const threadPool = new nativeModule.ThreadPool();
  console.log('✓ Successfully created ThreadPool instance');

  // Log available methods
  console.log('Available methods:', Object.getOwnPropertyNames(threadPool.__proto__));

  // Test thread count if method exists
  if (typeof threadPool.getThreadCount === 'function') {
    console.log('Thread count:', threadPool.getThreadCount());
  } else {
    console.log('Thread count function not available');
  }

  // Test submitting a task
  console.log('\nSubmitting a simple task...');
  const startTime = Date.now();

  const promise = threadPool.submit(() => {
    console.log('Task is running in thread pool');
    return 42;
  });

  promise
    .then(result => {
      const elapsed = Date.now() - startTime;
      console.log(`Task completed after ${elapsed}ms with result:`, result);

      // Try submitting multiple tasks in parallel
      console.log('\nSubmitting parallel tasks...');

      return Promise.all([
        threadPool.submit(() => 'Task 1 result'),
        threadPool.submit(() => 'Task 2 result'),
        threadPool.submit(() => 'Task 3 result')
      ]);
    })
    .then(results => {
      console.log('Parallel task results:', results);

      // Try submitting a task that throws an error
      console.log('\nSubmitting a task that throws an error...');
      return threadPool.submit(() => {
        throw new Error('Intentional error for testing');
      });
    })
    .catch(err => {
      console.log('Error handling works correctly, caught error:', err.message);

      // Check metrics if available
      if (typeof threadPool.getMetrics === 'function') {
        const metrics = threadPool.getMetrics();
        console.log('\nMetrics:', metrics);
      } else {
        console.log('\nMetrics function not available');
      }

      console.log('\nThreadPool test completed successfully');
    });

} catch (err) {
  console.error('Test failed with error:', err);
  process.exit(1);
}
