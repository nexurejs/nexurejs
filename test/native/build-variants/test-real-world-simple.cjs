/**
 * Simplified real-world test for NexureJS native modules
 * With enhanced error handling
 */

// Import the native module
let nexurejs;
try {
  nexurejs = require('./build/Release/nexurejs_native.node');
  console.log('Successfully loaded the native module');
} catch (err) {
  console.error('Failed to load the native module:', err.message);
  process.exit(1);
}

// Check if required components are available
if (!nexurejs.StringEncoder) {
  console.error('StringEncoder component not found in the native module');
  process.exit(1);
}

if (!nexurejs.ThreadPool) {
  console.error('ThreadPool component not found in the native module');
  process.exit(1);
}

// Get instances of our components
let encoder, threadPool;
try {
  console.log('Getting component instances...');
  encoder = nexurejs.StringEncoder.getInstance();
  threadPool = nexurejs.ThreadPool.getInstance();

  console.log('NexureJS Native Module Test');
  console.log('===========================');
  console.log(`Native module loaded with ${threadPool.getThreadCount()} worker threads\n`);

  // Reset metrics for clean measurements
  encoder.resetMetrics();
  threadPool.resetMetrics();
} catch (err) {
  console.error('Error initializing components:', err.message);
  process.exit(1);
}

// Helper function: Find prime numbers up to n (CPU-intensive task)
function findPrimes(n) {
  try {
    const primes = [];
    nextPrime:
    for (let i = 2; i <= n; i++) {
      for (let j = 0; j < primes.length; j++) {
        if (i % primes[j] === 0) continue nextPrime;
      }
      primes.push(i);
    }
    return primes;
  } catch (err) {
    console.error('Error in findPrimes:', err);
    return [];
  }
}

// Run a single task to test functionality
async function runSingleTask() {
  console.log('Testing single task submission...');

  try {
    // Create a simple form submission
    const submission =
      `name=${encoder.urlEncode('Test User')}&` +
      `message=${encoder.urlEncode('Hello, world!')}`;

    console.log('Created test submission');

    // Submit a task to process this submission
    console.log('Submitting task to thread pool...');

    const promise = threadPool.submit(() => {
      try {
        console.log('Task is running in thread pool');

        // Parse form data
        const fields = {};
        submission.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          fields[key] = encoder.urlDecode(value);
        });

        console.log('Parsed form data:', fields);

        // Do some work
        const primes = findPrimes(100);
        console.log(`Found ${primes.length} prime numbers`);

        // Create response
        const response = {
          success: true,
          message: `Hello, ${fields.name}!`,
          timestamp: Date.now(),
          primeCount: primes.length
        };

        console.log('Created response object');

        // Return the response
        return JSON.stringify(response);
      } catch (err) {
        console.error('Error in worker task:', err);
        throw err;
      }
    });

    console.log('Task submitted, waiting for result...');

    // Wait for task completion
    const result = await promise;
    console.log('Task completed with result:', result);

    // Get metrics
    const poolMetrics = threadPool.getMetrics();
    console.log('\nThreadPool Metrics:');
    console.log('- Submitted tasks:', poolMetrics.submittedTasks);
    console.log('- Completed tasks:', poolMetrics.completedTasks);

    console.log('\nTest completed successfully!');
  } catch (err) {
    console.error('Test failed with error:', err);
  }
}

// Run the test
runSingleTask().catch(err => {
  console.error('Unhandled error in test:', err);
});
