// Nexure.js Comparison Benchmarks
import nexurejs from '../lib/nexurejs.js';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import crypto from 'crypto';
import util from 'util';

// Test data
const SMALL_DATA = 'Hello, world!';
const MEDIUM_DATA = 'A'.repeat(5000);
const LARGE_DATA = 'X'.repeat(500000);
const COMPLEX_DATA = `{"data":{"users":[${Array(100).fill().map((_, i) =>
  `{"id":${i},"name":"User ${i}","email":"user${i}@example.com","active":${i % 2 === 0}}`
).join(',')}]}}`;

// Configuration
const ITERATIONS = 10000;
const CPU_ITERATIONS = 100;
const RESULTS_DIR = './benchmark-results';

// Create results directory if it doesn't exist
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Utility functions
const formatNumber = (num) => {
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const runBenchmark = async (name, fn, iterations = ITERATIONS) => {
  // Warm up
  for (let i = 0; i < Math.min(iterations * 0.1, 100); i++) {
    await fn();
  }

  // Measure execution time
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const end = performance.now();
  const duration = end - start;
  const avgDuration = duration / iterations;
  const opsPerSecond = (iterations / duration) * 1000;

  console.log(`${name.padEnd(30)}: ${formatNumber(avgDuration).padStart(10)} ms/op | ${formatNumber(opsPerSecond).padStart(10)} ops/sec`);

  return {
    name,
    iterations,
    totalDuration: duration,
    avgDuration,
    opsPerSecond
  };
};

// Base64 encoding comparison
const compareBase64Encoding = async () => {
  console.log('\n========== Base64 Encoding Comparison ==========');
  console.log('Implementation                 |   ms/op    |    ops/sec');
  console.log('--------------------------------------------------');

  const results = [];

  // Nexure.js - small data
  results.push(await runBenchmark('Nexure.js (small)', () => {
    return nexurejs.encode(SMALL_DATA, 'base64');
  }));

  // Node.js Buffer - small data
  results.push(await runBenchmark('Node.js Buffer (small)', () => {
    return Buffer.from(SMALL_DATA).toString('base64');
  }));

  // Nexure.js - medium data
  results.push(await runBenchmark('Nexure.js (medium)', () => {
    return nexurejs.encode(MEDIUM_DATA, 'base64');
  }, ITERATIONS / 5));

  // Node.js Buffer - medium data
  results.push(await runBenchmark('Node.js Buffer (medium)', () => {
    return Buffer.from(MEDIUM_DATA).toString('base64');
  }, ITERATIONS / 5));

  // Nexure.js - large data
  results.push(await runBenchmark('Nexure.js (large)', () => {
    return nexurejs.encode(LARGE_DATA, 'base64');
  }, ITERATIONS / 50));

  // Node.js Buffer - large data
  results.push(await runBenchmark('Node.js Buffer (large)', () => {
    return Buffer.from(LARGE_DATA).toString('base64');
  }, ITERATIONS / 50));

  return results;
};

// URL encoding comparison
const compareUrlEncoding = async () => {
  console.log('\n========== URL Encoding Comparison ==========');
  console.log('Implementation                 |   ms/op    |    ops/sec');
  console.log('--------------------------------------------------');

  const results = [];

  // Nexure.js - small data
  results.push(await runBenchmark('Nexure.js (small)', () => {
    return nexurejs.encode(SMALL_DATA, 'url');
  }));

  // encodeURIComponent - small data
  results.push(await runBenchmark('encodeURIComponent (small)', () => {
    return encodeURIComponent(SMALL_DATA);
  }));

  // Nexure.js - complex data
  results.push(await runBenchmark('Nexure.js (complex)', () => {
    return nexurejs.encode(COMPLEX_DATA, 'url');
  }, ITERATIONS / 10));

  // encodeURIComponent - complex data
  results.push(await runBenchmark('encodeURIComponent (complex)', () => {
    return encodeURIComponent(COMPLEX_DATA);
  }, ITERATIONS / 10));

  return results;
};

// Thread pool comparison
const compareThreadPool = async () => {
  console.log('\n========== Thread Pool Comparison ==========');
  console.log('Implementation                 |   ms/op    |    ops/sec');
  console.log('--------------------------------------------------');

  const results = [];

  // CPU-intensive task
  const cpuTask = () => {
    let sum = 0;
    for (let i = 0; i < 1000000; i++) {
      sum += Math.sqrt(i);
    }
    return sum;
  };

  // Nexure.js ThreadPool
  results.push(await runBenchmark('Nexure.js ThreadPool', async () => {
    return await nexurejs.runTask(cpuTask);
  }, CPU_ITERATIONS));

  // Node.js Worker Threads
  const runWorkerThread = () => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort } = require('worker_threads');

        // Execute the CPU-intensive task
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
          sum += Math.sqrt(i);
        }

        parentPort.postMessage(sum);
      `, { eval: true });

      worker.on('message', resolve);
      worker.on('error', reject);
    });
  };

  results.push(await runBenchmark('Node.js Worker Threads', async () => {
    return await runWorkerThread();
  }, CPU_ITERATIONS));

  // Direct execution
  results.push(await runBenchmark('Direct Execution', () => {
    return cpuTask();
  }, CPU_ITERATIONS));

  return results;
};

// Parallel task execution comparison
const compareParallelExecution = async () => {
  console.log('\n========== Parallel Task Execution Comparison ==========');
  console.log('Implementation                 |   ms/op    |    ops/sec');
  console.log('--------------------------------------------------');

  const results = [];

  // Create an array of tasks
  const createTasks = (count) => {
    return Array(count).fill().map((_, i) => async () => {
      // Mix of CPU and simulated I/O
      const start = Date.now();
      let sum = 0;

      // CPU work
      for (let j = 0; j < 100000; j++) {
        sum += j;
      }

      // Simulated I/O
      await new Promise(resolve => setTimeout(resolve, 5));

      // More CPU work
      const hash = crypto.createHash('sha256').update(`task-${i}-${sum}`).digest('hex');

      return {
        taskId: i,
        result: sum,
        hash,
        duration: Date.now() - start
      };
    });
  };

  // Nexure.js ThreadPool
  results.push(await runBenchmark('Nexure.js (10 tasks)', async () => {
    const tasks = createTasks(10);
    return await nexurejs.runAll(tasks);
  }, 10));

  // Promise.all with direct execution
  results.push(await runBenchmark('Promise.all (10 tasks)', async () => {
    const tasks = createTasks(10);
    return await Promise.all(tasks.map(task => task()));
  }, 10));

  // Nexure.js ThreadPool with more tasks
  results.push(await runBenchmark('Nexure.js (50 tasks)', async () => {
    const tasks = createTasks(50);
    return await nexurejs.runAll(tasks);
  }, 5));

  // Promise.all with direct execution
  results.push(await runBenchmark('Promise.all (50 tasks)', async () => {
    const tasks = createTasks(50);
    return await Promise.all(tasks.map(task => task()));
  }, 5));

  return results;
};

// Run all comparisons
const runAllComparisons = async () => {
  console.log('Starting Nexure.js Comparison Benchmarks...\n');

  const startTime = performance.now();

  // Run all comparisons
  const base64Results = await compareBase64Encoding();
  const urlResults = await compareUrlEncoding();
  const threadPoolResults = await compareThreadPool();
  const parallelResults = await compareParallelExecution();

  // Save results
  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  const results = {
    date: new Date().toISOString(),
    totalDuration,
    base64Encoding: base64Results,
    urlEncoding: urlResults,
    threadPool: threadPoolResults,
    parallelExecution: parallelResults
  };

  const resultsFile = path.join(RESULTS_DIR, `comparison-${Date.now()}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

  // Print summary
  console.log(`\nComparison benchmarks completed in ${formatNumber(totalDuration)}ms`);
  console.log(`Results saved to ${resultsFile}`);

  // Print overall performance comparison
  console.log('\n========== Performance Summary ==========');

  // Base64 encoding
  {
    const nexureAvg = base64Results.find(r => r.name === 'Nexure.js (medium)').avgDuration;
    const nodeAvg = base64Results.find(r => r.name === 'Node.js Buffer (medium)').avgDuration;
    const speedup = nodeAvg / nexureAvg;

    console.log(`Base64 Encoding: Nexure.js is ${formatNumber(speedup)}x ${speedup > 1 ? 'faster' : 'slower'} than Node.js Buffer`);
  }

  // URL encoding
  {
    const nexureAvg = urlResults.find(r => r.name === 'Nexure.js (complex)').avgDuration;
    const nodeAvg = urlResults.find(r => r.name === 'encodeURIComponent (complex)').avgDuration;
    const speedup = nodeAvg / nexureAvg;

    console.log(`URL Encoding: Nexure.js is ${formatNumber(speedup)}x ${speedup > 1 ? 'faster' : 'slower'} than encodeURIComponent`);
  }

  // Thread pool
  {
    const nexureAvg = threadPoolResults.find(r => r.name === 'Nexure.js ThreadPool').avgDuration;
    const workerAvg = threadPoolResults.find(r => r.name === 'Node.js Worker Threads').avgDuration;
    const speedup = workerAvg / nexureAvg;

    console.log(`Thread Pool: Nexure.js is ${formatNumber(speedup)}x ${speedup > 1 ? 'faster' : 'slower'} than Node.js Worker Threads`);
  }

  // Parallel execution
  {
    const nexureAvg = parallelResults.find(r => r.name === 'Nexure.js (50 tasks)').avgDuration;
    const promiseAvg = parallelResults.find(r => r.name === 'Promise.all (50 tasks)').avgDuration;
    const speedup = promiseAvg / nexureAvg;

    console.log(`Parallel Execution: Nexure.js is ${formatNumber(speedup)}x ${speedup > 1 ? 'faster' : 'slower'} than Promise.all`);
  }
};

// Run the comparison benchmarks
runAllComparisons().catch(console.error);
