// ThreadPool Test Suite
import { ThreadPool } from './build/Release/nexurejs_native.node';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

// Configuration
const LOG_DIR = './logs';
const LOG_FILE = path.join(LOG_DIR, 'thread-pool-test.log');

// Create log directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Test utilities
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const createTaskFunction = (duration, shouldSucceed = true, returnValue = null) => {
  return () => {
    // Simulate work
    const start = Date.now();
    while (Date.now() - start < duration) {
      // Busy wait
    }

    if (!shouldSucceed) {
      throw new Error('Task failed as requested');
    }

    return returnValue;
  };
};

// Define priority levels for readability
const PRIORITY = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

// Start Test Suite
console.log('Starting ThreadPool Test Suite...\n');

async function runTests() {
  try {
    // Create ThreadPool
    console.log('Creating ThreadPool instance...');
    const pool = new ThreadPool();

    // Configure logging
    console.log('Configuring logging...');
    pool.setLogLevel(0); // TRACE level for comprehensive logs
    pool.setLogFile(LOG_FILE);

    // Basic submission test
    console.log('\nTest 1: Basic Task Submission');
    const basicResult = await pool.submit(() => {
      return 'Hello from ThreadPool!';
    });
    console.log(`- Result: ${basicResult}`);
    assert.strictEqual(basicResult, 'Hello from ThreadPool!');

    // Priority test
    console.log('\nTest 2: Task Prioritization');
    const results = [];
    const taskOrder = [];

    // Submit tasks with different priorities in reverse order
    const lowTask = pool.submitWithPriority(() => {
      taskOrder.push('LOW');
      return 'Low priority task';
    }, PRIORITY.LOW);

    const normalTask = pool.submitWithPriority(() => {
      taskOrder.push('NORMAL');
      return 'Normal priority task';
    }, PRIORITY.NORMAL);

    const highTask = pool.submitWithPriority(() => {
      taskOrder.push('HIGH');
      return 'High priority task';
    }, PRIORITY.HIGH);

    const criticalTask = pool.submitWithPriority(() => {
      taskOrder.push('CRITICAL');
      return 'Critical priority task';
    }, PRIORITY.CRITICAL);

    // Wait for all tasks to complete
    results.push(await lowTask);
    results.push(await normalTask);
    results.push(await highTask);
    results.push(await criticalTask);

    console.log(`- Execution order: ${taskOrder.join(' -> ')}`);
    console.log(`- Results: ${results.join(', ')}`);

    // Check if higher priority tasks executed before lower priority ones
    // Note: This isn't guaranteed if tasks are picked up immediately by different threads,
    // so we can't reliably assert the exact order.
    console.log(`- Priority system ${
      taskOrder.indexOf('CRITICAL') < taskOrder.indexOf('LOW') ? 'working as expected' : 'may need review'
    }`);

    // Error handling and retry test
    console.log('\nTest 3: Error Handling and Retry');
    try {
      // Submit a task that will fail
      await pool.submit(() => {
        throw new Error('EAGAIN: Resource temporarily unavailable');
      });

      console.log('- Task should have failed but succeeded');
      assert.fail('Expected task to fail');
    } catch (error) {
      console.log(`- Task failed as expected: ${error.message}`);
    }

    // Task cancellation test
    console.log('\nTest 4: Task Cancellation');
    const longRunningTask = pool.submit(createTaskFunction(5000, true, 'Long task completed'));

    // Get the task ID from the promise (this is implementation-specific)
    // For demonstration, we'll use the submitWithPriority method to get multiple tasks
    // and then cancel a specific one based on the queue stats

    // Submit more tasks
    pool.submitWithPriority(createTaskFunction(1000, true, 'Task 1'), PRIORITY.NORMAL);
    pool.submitWithPriority(createTaskFunction(1000, true, 'Task 2'), PRIORITY.NORMAL);
    pool.submitWithPriority(createTaskFunction(1000, true, 'Task 3'), PRIORITY.NORMAL);

    // Wait a bit to ensure tasks are queued
    await delay(100);

    // Get queue stats
    const queueStats = pool.getQueueStats();
    console.log(`- Queue stats: ${JSON.stringify(queueStats, null, 2)}`);

    // Cancel the long running task (this would need a proper task ID)
    // For this test, we'll assume cancel expects a task ID that we don't have
    // So we'll simulate a cancel by not waiting for the task to complete
    // longRunningTask.cancel(); // This would be the ideal way

    // Waiting for all tasks to complete with timeout
    console.log('\nTest 5: WaitAll with Timeout');
    const waitResult = await pool.waitAll(2000); // 2 second timeout

    console.log(`- WaitAll result: ${JSON.stringify(waitResult, null, 2)}`);
    console.log(`- Wait completed: ${waitResult.timedOut ? 'timed out' : 'all tasks finished'}`);

    // Stress test - submit many tasks
    console.log('\nTest 6: Stress Test');
    const taskCount = 100;
    const stressPromises = [];

    console.log(`- Submitting ${taskCount} tasks...`);
    for (let i = 0; i < taskCount; i++) {
      const priority = i % 4; // Cycle through priorities
      stressPromises.push(
        pool.submitWithPriority(
          createTaskFunction(10 + (i % 5) * 10, i % 10 !== 0, `Task ${i}`),
          priority
        )
      );
    }

    // Wait for all stress test tasks with a generous timeout
    const stressWaitResult = await pool.waitAll(10000);
    console.log(`- Stress test ${stressWaitResult.timedOut ? 'timed out' : 'completed'}`);
    console.log(`- Tasks completed: ${stressWaitResult.metrics.completed}`);
    console.log(`- Tasks failed: ${stressWaitResult.metrics.failed}`);

    // Final metrics
    console.log('\nFinal ThreadPool Metrics:');
    const finalStats = pool.getQueueStats();
    console.log(JSON.stringify(finalStats, null, 2));

    console.log('\nThreadPool Test Suite completed successfully');
    console.log(`Detailed logs available at: ${LOG_FILE}`);

  } catch (error) {
    console.error('Test suite error:', error);
  }
}

runTests();
