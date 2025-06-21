/**
 * Worker Task Script for Adaptive Worker Pool
 *
 * This worker handles tasks sent by the adaptive worker pool
 * and reports execution metrics back to the main thread.
 */

import { parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

// Track resource usage
let cpuUsage = 0;
let memoryUsage = 0;

// Simulate CPU-intensive task
function simulateCpuWork(iterations) {
  const startTime = performance.now();

  // Create some CPU load
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    // Intentionally CPU-intensive operations
    result += Math.sin(i) * Math.cos(i);
    result = Math.sqrt(result * result);

    // Every 10000 iterations, check if we should yield
    if (i % 10000 === 0) {
      const elapsedTime = performance.now() - startTime;
      if (elapsedTime > 100) {
        // Allow other tasks to run if we've been computing for >100ms
        // This prevents blocking the event loop for too long
        return new Promise(resolve => {
          setImmediate(() => {
            resolve(simulateCpuWork(iterations - i));
          });
        }).then(remainingResult => {
          return result + remainingResult;
        });
      }
    }
  }

  return result;
}

// Simulate memory-intensive task
function simulateMemoryWork(size) {
  // Allocate a large array to simulate memory usage
  const buffer = Buffer.alloc(size * 1024 * 1024); // Size in MB

  // Do some work with the buffer to prevent optimization
  for (let i = 0; i < buffer.length; i += 1024) {
    buffer[i] = i % 256;
  }

  // Use the buffer and return some result
  return buffer.slice(0, 10).toString('hex');
}

// Process incoming task messages
parentPort.on('message', async (message) => {
  const { id, data } = message;
  const startTime = performance.now();

  try {
    // Capture initial resource usage
    const initialCpuUsage = process.cpuUsage();
    const initialMemUsage = process.memoryUsage();

    let result;

    // Execute the task based on type
    if (data.cpuIntensive) {
      // CPU-intensive task
      result = await simulateCpuWork(data.iterations);
    } else {
      // Simulate some basic work
      result = simulateCpuWork(data.iterations / 10);
    }

    // Artificial delay to simulate task duration if specified
    if (data.duration) {
      const elapsed = performance.now() - startTime;
      if (elapsed < data.duration) {
        await new Promise(resolve => setTimeout(resolve, data.duration - elapsed));
      }
    }

    // Calculate resource usage
    const endCpuUsage = process.cpuUsage(initialCpuUsage);
    const endMemUsage = process.memoryUsage();

    // Calculate CPU usage percentage (user + system time)
    const cpuUserTime = endCpuUsage.user / 1000; // microseconds to milliseconds
    const cpuSystemTime = endCpuUsage.system / 1000; // microseconds to milliseconds
    const totalTime = performance.now() - startTime;

    // Calculate CPU usage as a value between 0-1
    cpuUsage = (cpuUserTime + cpuSystemTime) / totalTime;

    // Calculate memory increase
    memoryUsage = (endMemUsage.heapUsed - initialMemUsage.heapUsed) / 1024 / 1024; // MB

    // Send successful result back to main thread with metrics
    parentPort.postMessage({
      id,
      result: {
        value: result,
        processedAt: new Date().toISOString()
      },
      metrics: {
        cpuUsage,
        memoryUsage,
        heapUsed: endMemUsage.heapUsed,
        heapTotal: endMemUsage.heapTotal
      }
    });

  } catch (error) {
    // Send error back to main thread
    parentPort.postMessage({
      id,
      error: {
        message: error.message,
        stack: error.stack
      },
      metrics: {
        cpuUsage,
        memoryUsage
      }
    });
  }
});

// Send ready message to parent
parentPort.postMessage({ ready: true, workerId: Date.now() });

// Report periodic health status
setInterval(() => {
  const memUsage = process.memoryUsage();

  parentPort.postMessage({
    status: 'health',
    metrics: {
      cpuUsage,
      memoryUsage: memUsage.heapUsed / 1024 / 1024, // MB
      rss: memUsage.rss / 1024 / 1024, // MB
      timestamp: Date.now()
    }
  });
}, 5000); // Every 5 seconds
