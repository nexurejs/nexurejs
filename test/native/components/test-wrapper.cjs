// Nexure.js Wrapper Test
const { NexureJS } = require('./lib/nexurejs.cjs');
const nexurejs = require('./lib/nexurejs.cjs').default;
const assert = require('assert');

// Test utilities
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  try {
    console.log('Starting Nexure.js Wrapper Test...\n');

    // Test singleton instance
    console.log('Test 1: Default Singleton Instance');
    const encodedString = nexurejs.encode('Test string', 'base64');
    const decodedString = nexurejs.decode(encodedString, 'base64');
    console.log(`- Encoded: ${encodedString}`);
    console.log(`- Decoded: ${decodedString}`);
    assert.strictEqual(decodedString, 'Test string', 'String encoding/decoding roundtrip failed');

    // Test custom instance with configuration
    console.log('\nTest 2: Custom Instance with Configuration');
    const customNexure = new NexureJS({
      logging: {
        level: 0, // TRACE level
        file: './logs/custom-nexure.log'
      },
      threadPool: {
        threadCount: 2,
        maxRetries: 5
      }
    });

    // Test string encoding
    const urlEncoded = customNexure.encode('https://example.com/?q=test&param=value', 'url');
    console.log(`- URL Encoded: ${urlEncoded}`);
    const urlDecoded = customNexure.decode(urlEncoded, 'url');
    console.log(`- URL Decoded: ${urlDecoded}`);

    // Test thread pool
    console.log('\nTest 3: Thread Pool Task Execution');
    const result = await customNexure.runTask(() => {
      // Simulating work
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += i;
      }
      return sum;
    }, 2); // HIGH priority

    console.log(`- Task result: ${result}`);

    // Test parallel task execution
    console.log('\nTest 4: Parallel Task Execution');
    const tasks = [
      () => 'Task 1 result',
      () => 'Task 2 result',
      () => 'Task 3 result',
      () => {
        // Simulate work
        let product = 1;
        for (let i = 1; i <= 10; i++) {
          product *= i;
        }
        return `Factorial of 10 is ${product}`;
      }
    ];

    const results = await customNexure.runAll(tasks, 1, 5000); // NORMAL priority, 5s timeout
    console.log(`- Parallel results: ${results.join(', ')}`);
    assert.strictEqual(results.length, tasks.length, 'Not all tasks returned results');

    // Test error handling
    console.log('\nTest 5: Error Handling');
    try {
      await customNexure.runTask(() => {
        throw new Error('Intentional task error');
      });
      console.log('- Error handling test FAILED: Expected an error but none was thrown');
    } catch (error) {
      console.log(`- Error handling test PASSED: ${error.message}`);
    }

    // Stress test the thread pool
    console.log('\nTest 6: Thread Pool Stress Test');
    const taskCount = 50;
    const stressTasks = [];

    for (let i = 0; i < taskCount; i++) {
      stressTasks.push(() => {
        // Task with varying durations
        const duration = 10 + (i % 5) * 20;
        const start = Date.now();
        while (Date.now() - start < duration) {
          // Busy wait
        }
        return `Task ${i} completed in ${Date.now() - start}ms`;
      });
    }

    console.log(`- Submitting ${taskCount} tasks with different priorities...`);
    console.time('Stress test');

    // Submit tasks with different priorities
    const stressPromises = stressTasks.map((task, index) => {
      const priority = index % 4; // Cycle through all priorities
      return customNexure.runTask(task, priority);
    });

    // Wait for all tasks to complete
    const stressResults = await Promise.all(stressPromises);
    console.timeEnd('Stress test');
    console.log(`- All ${stressResults.length} tasks completed`);

    // Test metrics
    console.log('\nTest 7: Performance Metrics');
    const metrics = customNexure.getMetrics();
    console.log('- Thread Pool Metrics:');
    console.log(JSON.stringify(metrics.threadPool, null, 2));
    console.log('- String Encoder Metrics:');
    console.log(JSON.stringify(metrics.stringEncoder, null, 2));

    console.log('\nNexure.js Wrapper Test completed successfully');
  } catch (error) {
    console.error('Test error:', error);
  }
}

runTests();
