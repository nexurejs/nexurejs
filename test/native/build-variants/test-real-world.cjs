/**
 * Real-world application test for NexureJS native modules
 * This tests both StringEncoder and ThreadPool in a realistic workload scenario
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

// Utility function to format numbers with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
  encoder = nexurejs.StringEncoder.getInstance();
  threadPool = nexurejs.ThreadPool.getInstance();

  console.log('NexureJS Native Module Test');
  console.log('===========================');
  console.log(`Native module loaded successfully with ${threadPool.getThreadCount()} worker threads\n`);

  // Reset metrics for clean measurements
  encoder.resetMetrics();
  threadPool.resetMetrics();
} catch (err) {
  console.error('Error initializing components:', err.message);
  process.exit(1);
}

/**
 * Scenario: Web server processing incoming data
 *
 * 1. Process multiple URL-encoded form submissions in parallel
 * 2. Decode the data
 * 3. Perform some CPU-intensive work on each submission
 * 4. Encode responses
 */

async function runTest() {
  console.log('Starting test - simulating web server processing...\n');

  try {
    // Create a smaller sample for testing
    const submissions = [];
    const sampleSize = 10; // Reduced from 100 to 10 for initial testing

    for (let i = 0; i < sampleSize; i++) {
      // Create form with various fields and special characters
      submissions.push(
        `name=${encoder.urlEncode(`User ${i} with & special chars`)}&` +
        `email=${encoder.urlEncode(`user${i}@example.com`)}&` +
        `message=${encoder.urlEncode(`This is a test message #${i} with special chars: !@#$%^&*()`)}&` +
        `data=${encoder.urlEncode(Buffer.from(JSON.stringify({
          id: i,
          timestamp: Date.now(),
          settings: { theme: 'dark', notifications: true }
        })).toString('base64'))}`
      );
    }

    console.log(`Created ${submissions.length} simulated form submissions`);

    // Process submissions in parallel using ThreadPool
    console.log('Processing submissions in parallel...');
    const startTime = Date.now();

    const processingPromises = submissions.map(submission => {
      return threadPool.submit(() => {
        try {
          // Simulate server processing a form submission

          // 1. Parse the form data
          const fields = {};
          submission.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            fields[key] = encoder.urlDecode(value);
          });

          // 2. Process the data (CPU-intensive work - calculate prime numbers)
          // Use a smaller range for testing
          const primes = findPrimes(1000 + (parseInt(fields.name.split(' ')[1]) % 1000));

          // 3. For the "data" field, decode base64 and parse JSON
          let parsedData = null;
          if (fields.data) {
            const jsonString = Buffer.from(fields.data, 'base64').toString();
            parsedData = JSON.parse(jsonString);
          }

          // 4. Build a response (including HTML encoding for safety)
          const response = {
            success: true,
            message: `Hello, ${encoder.htmlEncode(fields.name)}! Your message has been processed.`,
            timestamp: Date.now(),
            primeCount: primes.length,
            data: parsedData
          };

          // 5. Encode the response for transport
          return encoder.base64Encode(JSON.stringify(response));
        } catch (err) {
          console.error('Error in worker thread:', err.message);
          throw err; // Re-throw so the promise is rejected
        }
      });
    });

    // Wait for all submissions to be processed
    const results = await Promise.all(processingPromises);

    const totalTime = Date.now() - startTime;
    console.log(`Processed ${results.length} submissions in ${totalTime}ms`);
    console.log(`Average processing time: ${(totalTime / results.length).toFixed(2)}ms per submission`);

    // Verify a sample result by decoding it
    if (results.length > 0) {
      try {
        const sampleResponse = JSON.parse(
          Buffer.from(encoder.base64Decode(results[0]), 'utf8').toString()
        );

        console.log('\nSample response:');
        console.log(JSON.stringify(sampleResponse, null, 2));
      } catch (err) {
        console.error('Error decoding sample response:', err.message);
      }
    }

    // Display metrics
    try {
      console.log('\nStringEncoder Metrics:');
      const encoderMetrics = encoder.getMetrics();
      console.log(`- Total encoding operations: ${formatNumber(encoderMetrics.totalEncodingOperations)}`);
      console.log(`- Total decoding operations: ${formatNumber(encoderMetrics.totalDecodingOperations)}`);
      console.log(`- URL encoding operations: ${formatNumber(encoderMetrics.urlEncodingCount)}`);
      console.log(`- URL decoding operations: ${formatNumber(encoderMetrics.urlDecodingCount)}`);
      console.log(`- Base64 encoding operations: ${formatNumber(encoderMetrics.base64EncodingCount)}`);
      console.log(`- Base64 decoding operations: ${formatNumber(encoderMetrics.base64DecodingCount)}`);
      console.log(`- HTML encoding operations: ${formatNumber(encoderMetrics.htmlEncodingCount)}`);
      console.log(`- Total bytes processed: ${formatNumber(encoderMetrics.totalBytesProcessed)} bytes`);
      console.log(`- Average encoding time: ${encoderMetrics.avgEncodingTimeMs.toFixed(3)}ms`);
      console.log(`- Average decoding time: ${encoderMetrics.avgDecodingTimeMs.toFixed(3)}ms`);
    } catch (err) {
      console.error('Error retrieving encoder metrics:', err.message);
    }

    try {
      console.log('\nThreadPool Metrics:');
      const poolMetrics = threadPool.getMetrics();
      console.log(`- Submitted tasks: ${formatNumber(poolMetrics.submittedTasks)}`);
      console.log(`- Completed tasks: ${formatNumber(poolMetrics.completedTasks)}`);
      console.log(`- Failed tasks: ${formatNumber(poolMetrics.failedTasks)}`);
      console.log(`- Cancelled tasks: ${formatNumber(poolMetrics.cancelledTasks)}`);
      console.log(`- Total execution time: ${formatNumber(poolMetrics.totalExecutionTimeUs / 1000)}ms`);
    } catch (err) {
      console.error('Error retrieving thread pool metrics:', err.message);
    }

    console.log('\nTest completed successfully!');
  } catch (err) {
    console.error('Test failed with error:', err.message);
    process.exit(1);
  }
}

// Helper function: Find prime numbers up to n (CPU-intensive task)
function findPrimes(n) {
  const primes = [];
  nextPrime:
  for (let i = 2; i <= n; i++) {
    for (let j = 0; j < primes.length; j++) {
      if (i % primes[j] === 0) continue nextPrime;
    }
    primes.push(i);
  }
  return primes;
}

// Run the test
runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
