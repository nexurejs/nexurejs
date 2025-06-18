// Nexure.js Benchmarks
import nexurejs from '../lib/nexurejs.js';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

// Configuration
const RESULTS_DIR = './benchmark-results';
const LOG_FILE = path.join(RESULTS_DIR, 'benchmark.log');

// Create results directory if it doesn't exist
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Set up logging
nexurejs.threadPool.setLogLevel(2); // INFO
nexurejs.threadPool.setLogFile(LOG_FILE);
nexurejs.stringEncoder.setLogLevel(2); // INFO
nexurejs.stringEncoder.setLogFile(LOG_FILE);

// Benchmark utilities
const formatNumber = (num) => {
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const runBenchmark = async (name, fn, iterations = 1000) => {
  console.log(`\nRunning benchmark: ${name} (${iterations} iterations)`);

  // Warm up
  for (let i = 0; i < Math.min(iterations * 0.1, 100); i++) {
    await fn();
  }

  // Reset metrics before measurement
  nexurejs.resetMetrics();

  // Measure execution time
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const end = performance.now();
  const duration = end - start;
  const opsPerSecond = (iterations / duration) * 1000;

  console.log(`- Total time: ${formatNumber(duration)}ms`);
  console.log(`- Average per operation: ${formatNumber(duration / iterations)}ms`);
  console.log(`- Operations per second: ${formatNumber(opsPerSecond)}`);

  return {
    name,
    iterations,
    totalDuration: duration,
    avgDuration: duration / iterations,
    opsPerSecond
  };
};

// Test data setup
const smallString = 'Hello, world!';
const mediumString = 'A'.repeat(1000) + 'B'.repeat(1000) + 'C'.repeat(1000);
const largeString = 'X'.repeat(100000);
const complexString = `{"data":{"users":[${Array(100).fill().map((_, i) =>
  `{"id":${i},"name":"User ${i}","email":"user${i}@example.com","active":${i % 2 === 0}}`
).join(',')}]}}`;

// ThreadPool benchmarks
const runThreadPoolBenchmarks = async () => {
  console.log('\n========== ThreadPool Benchmarks ==========');

  const results = [];

  // Simple task
  results.push(await runBenchmark('Simple Task', async () => {
    return nexurejs.runTask(() => 1 + 1);
  }, 1000));

  // CPU-intensive task
  results.push(await runBenchmark('CPU Intensive Task', async () => {
    return nexurejs.runTask(() => {
      let sum = 0;
      for (let i = 0; i < 100000; i++) {
        sum += Math.sqrt(i);
      }
      return sum;
    });
  }, 100));

  // Parallel tasks
  results.push(await runBenchmark('10 Parallel Tasks', async () => {
    const tasks = Array(10).fill().map(() => () => {
      let sum = 0;
      for (let i = 0; i < 10000; i++) {
        sum += i;
      }
      return sum;
    });
    return nexurejs.runAll(tasks);
  }, 50));

  // Priority comparison
  const priorityTest = async (priority) => {
    const start = performance.now();
    await nexurejs.runTask(() => {
      let sum = 0;
      for (let i = 0; i < 50000; i++) {
        sum += i;
      }
      return sum;
    }, priority);
    return performance.now() - start;
  };

  // Run the priority tests under load
  console.log('\nPriority Comparison (under load):');

  // Create background load first
  const backgroundTasks = [];
  for (let i = 0; i < 20; i++) {
    backgroundTasks.push(nexurejs.runTask(() => {
      let sum = 0;
      for (let j = 0; j < 100000; j++) {
        sum += j;
      }
      return sum;
    }, 0)); // LOW priority
  }

  // Test different priorities
  const lowTime = await priorityTest(0); // LOW
  const normalTime = await priorityTest(1); // NORMAL
  const highTime = await priorityTest(2); // HIGH
  const criticalTime = await priorityTest(3); // CRITICAL

  console.log(`- LOW priority: ${formatNumber(lowTime)}ms`);
  console.log(`- NORMAL priority: ${formatNumber(normalTime)}ms`);
  console.log(`- HIGH priority: ${formatNumber(highTime)}ms`);
  console.log(`- CRITICAL priority: ${formatNumber(criticalTime)}ms`);

  // Wait for background tasks to complete
  await Promise.all(backgroundTasks);

  return results;
};

// StringEncoder benchmarks
const runStringEncoderBenchmarks = async () => {
  console.log('\n========== StringEncoder Benchmarks ==========');

  const results = [];

  // Base64 encoding
  results.push(await runBenchmark('Base64 Encode - Small String', () => {
    return nexurejs.encode(smallString, 'base64');
  }, 10000));

  results.push(await runBenchmark('Base64 Encode - Medium String', () => {
    return nexurejs.encode(mediumString, 'base64');
  }, 1000));

  results.push(await runBenchmark('Base64 Encode - Large String', () => {
    return nexurejs.encode(largeString, 'base64');
  }, 100));

  // URL encoding
  results.push(await runBenchmark('URL Encode - Small String', () => {
    return nexurejs.encode(smallString, 'url');
  }, 10000));

  results.push(await runBenchmark('URL Encode - Complex String', () => {
    return nexurejs.encode(complexString, 'url');
  }, 1000));

  // HTML encoding
  results.push(await runBenchmark('HTML Encode - Small String', () => {
    return nexurejs.encode(smallString, 'html');
  }, 10000));

  results.push(await runBenchmark('HTML Encode - Complex String', () => {
    return nexurejs.encode(
      '<div class="container">' +
      '<h1>Hello, world! & welcome</h1>' +
      '<script>alert("XSS");</script>' +
      '</div>',
      'html'
    );
  }, 5000));

  // Comparison with native JavaScript
  console.log('\nComparison with native JavaScript:');

  // Native JS base64
  const nativeBase64 = await runBenchmark('Native JS Base64', () => {
    return Buffer.from(mediumString).toString('base64');
  }, 10000);

  // Nexure base64
  const nexureBase64 = await runBenchmark('Nexure Base64', () => {
    return nexurejs.encode(mediumString, 'base64');
  }, 10000);

  // Calculate speedup
  const speedup = nativeBase64.avgDuration / nexureBase64.avgDuration;
  console.log(`\nPerformance comparison:`);
  console.log(`- Native JS: ${formatNumber(nativeBase64.avgDuration)}ms per operation`);
  console.log(`- Nexure: ${formatNumber(nexureBase64.avgDuration)}ms per operation`);
  console.log(`- Speedup: ${formatNumber(speedup)}x`);

  return results;
};

// Run the benchmarks
async function runAllBenchmarks() {
  console.log('Starting Nexure.js Benchmarks...\n');

  const startTime = performance.now();

  // Run ThreadPool benchmarks
  const threadPoolResults = await runThreadPoolBenchmarks();

  // Run StringEncoder benchmarks
  const stringEncoderResults = await runStringEncoderBenchmarks();

  // Get final metrics
  const metrics = nexurejs.getMetrics();

  // Calculate overall stats
  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  // Save results to file
  const results = {
    date: new Date().toISOString(),
    totalDuration,
    threadPool: {
      results: threadPoolResults,
      metrics: metrics.threadPool
    },
    stringEncoder: {
      results: stringEncoderResults,
      metrics: metrics.stringEncoder
    }
  };

  const resultsFile = path.join(RESULTS_DIR, `benchmark-${Date.now()}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

  console.log(`\nBenchmarks completed in ${formatNumber(totalDuration)}ms`);
  console.log(`Results saved to ${resultsFile}`);
}

runAllBenchmarks().catch(console.error);
