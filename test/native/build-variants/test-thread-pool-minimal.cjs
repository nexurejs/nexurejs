/**
 * Minimal test for ThreadPool with primitive return values
 */

try {
  console.log('Loading module...');
  const nativeModule = require('./build/Release/nexurejs_native.node');

  // Get ThreadPool instance
  const threadPool = nativeModule.ThreadPool.getInstance();
  console.log('Got ThreadPool instance with', threadPool.getThreadCount(), 'threads');

  // Submit a task that simply returns a number
  console.log('Submitting task 1 - number...');
  threadPool.submit(() => 42)
    .then(result => console.log('Task 1 result:', result))
    .catch(err => console.error('Task 1 error:', err));

  // Submit a task that returns a string
  console.log('Submitting task 2 - string...');
  threadPool.submit(() => 'hello')
    .then(result => console.log('Task 2 result:', result))
    .catch(err => console.error('Task 2 error:', err));

  // Submit a task that returns a boolean
  console.log('Submitting task 3 - boolean...');
  threadPool.submit(() => true)
    .then(result => console.log('Task 3 result:', result))
    .catch(err => console.error('Task 3 error:', err));

  // Submit a task that returns null
  console.log('Submitting task 4 - null...');
  threadPool.submit(() => null)
    .then(result => console.log('Task 4 result:', result))
    .catch(err => console.error('Task 4 error:', err));

  // Keep the process alive long enough for tasks to complete
  setTimeout(() => {
    console.log('Getting metrics...');
    const metrics = threadPool.getMetrics();
    console.log('ThreadPool metrics:', metrics);
    console.log('Test complete');
  }, 1000);

} catch (err) {
  console.error('Test failed:', err);
}
