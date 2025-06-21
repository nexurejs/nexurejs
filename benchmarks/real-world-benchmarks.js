#!/usr/bin/env node

/**
 * Real-World Benchmarks for NexureJS
 * Tests actual production scenarios and use cases
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Benchmark configurations
const BENCHMARK_CONFIG = {
  warmupRequests: 1000,
  testRequests: 10000,
  concurrency: 100,
  timeout: 30000,
  iterations: 5
};

// Results storage
const results = {
  scenarios: {},
  summary: {},
  metadata: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: require('os').cpus().length,
    memory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB'
  }
};

// Helper functions
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

/**
 * HTTP Load Testing with various scenarios
 */
async function runHttpBenchmarks() {
  log('Starting HTTP benchmarks...');

  const scenarios = [
    {
      name: 'Simple GET API',
      endpoint: '/api/hello',
      method: 'GET',
      description: 'Basic GET request returning JSON'
    },
    {
      name: 'POST with JSON',
      endpoint: '/api/user',
      method: 'POST',
      body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
      headers: { 'Content-Type': 'application/json' },
      description: 'POST request with JSON payload'
    },
    {
      name: 'Database Query Simulation',
      endpoint: '/api/users',
      method: 'GET',
      description: 'Simulated database query with pagination'
    },
    {
      name: 'File Upload Simulation',
      endpoint: '/api/upload',
      method: 'POST',
      body: 'x'.repeat(1024 * 10), // 10KB file
      headers: { 'Content-Type': 'application/octet-stream' },
      description: '10KB file upload simulation'
    },
    {
      name: 'Complex Computation',
      endpoint: '/api/compute',
      method: 'POST',
      body: JSON.stringify({ numbers: Array.from({length: 1000}, (_, i) => i) }),
      headers: { 'Content-Type': 'application/json' },
      description: 'CPU-intensive computation task'
    }
  ];

  // Start test servers
  const servers = await startTestServers();

  for (const scenario of scenarios) {
    log(`Running scenario: ${scenario.name}`);

    const serverResults = {};

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      try {
        const result = await benchmarkScenario(serverConfig.url, scenario);
        serverResults[serverName] = result;
        log(`${serverName} - ${scenario.name}: ${result.rps.toFixed(0)} req/s`);
      } catch (error) {
        log(`Error testing ${serverName}: ${error.message}`);
        serverResults[serverName] = { error: error.message };
      }
    }

    results.scenarios[scenario.name] = {
      description: scenario.description,
      results: serverResults
    };
  }

  // Stop test servers
  await stopTestServers(servers);
}

/**
 * Start test servers for different frameworks
 */
async function startTestServers() {
  const servers = {};

  // NexureJS Server
  servers.nexurejs = {
    process: null,
    url: 'http://localhost:3001',
    port: 3001
  };

  // Express Server
  servers.express = {
    process: null,
    url: 'http://localhost:3002',
    port: 3002
  };

  // Fastify Server
  servers.fastify = {
    process: null,
    url: 'http://localhost:3003',
    port: 3003
  };

  // Start servers
  await Promise.all([
    startNexureServer(servers.nexurejs),
    startExpressServer(servers.express),
    startFastifyServer(servers.fastify)
  ]);

  // Wait for servers to be ready
  await sleep(2000);

  return servers;
}

/**
 * Start NexureJS test server
 */
async function startNexureServer(serverConfig) {
  const serverCode = `
import { NexureJS } from '../src/index.js';
import crypto from 'crypto';

const app = new NexureJS();

// Middleware for timing
app.use((req, res, next) => {
  req.startTime = performance.now();
  next();
});

// Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from NexureJS!', timestamp: Date.now() });
});

app.post('/api/user', (req, res) => {
  const user = req.body;
  res.json({
    id: crypto.randomUUID(),
    ...user,
    created: Date.now()
  });
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  // Simulate database query
  const users = Array.from({length: limit}, (_, i) => ({
    id: crypto.randomUUID(),
    name: \`User \${(page - 1) * limit + i + 1}\`,
    email: \`user\${i + 1}@example.com\`,
    created: Date.now() - Math.random() * 86400000
  }));

  res.json({
    data: users,
    pagination: { page, limit, total: 10000 }
  });
});

app.post('/api/upload', (req, res) => {
  const size = req.body.length;
  res.json({
    message: 'File uploaded successfully',
    size: size,
    timestamp: Date.now()
  });
});

app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;

  // CPU-intensive computation
  let sum = 0;
  let squares = 0;

  for (const num of numbers) {
    sum += num;
    squares += num * num;
    // Add some computation complexity
    Math.sqrt(num * num + 1);
  }

  res.json({
    sum,
    squares,
    average: sum / numbers.length,
    count: numbers.length,
    computed: Date.now()
  });
});

app.listen(${serverConfig.port}, () => {
  console.log('NexureJS test server running on port ${serverConfig.port}');
});
`;

  await fs.writeFile(path.join(__dirname, 'test-server-nexure.js'), serverCode);

  serverConfig.process = spawn('node', [path.join(__dirname, 'test-server-nexure.js')], {
    stdio: 'pipe',
    detached: false
  });
}

/**
 * Start Express test server
 */
async function startExpressServer(serverConfig) {
  const serverCode = `
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Middleware for timing
app.use((req, res, next) => {
  req.startTime = performance.now();
  next();
});

// Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!', timestamp: Date.now() });
});

app.post('/api/user', (req, res) => {
  const user = req.body;
  res.json({
    id: crypto.randomUUID(),
    ...user,
    created: Date.now()
  });
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  // Simulate database query
  const users = Array.from({length: limit}, (_, i) => ({
    id: crypto.randomUUID(),
    name: \`User \${(page - 1) * limit + i + 1}\`,
    email: \`user\${i + 1}@example.com\`,
    created: Date.now() - Math.random() * 86400000
  }));

  res.json({
    data: users,
    pagination: { page, limit, total: 10000 }
  });
});

app.post('/api/upload', (req, res) => {
  const size = req.body.length;
  res.json({
    message: 'File uploaded successfully',
    size: size,
    timestamp: Date.now()
  });
});

app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;

  // CPU-intensive computation
  let sum = 0;
  let squares = 0;

  for (const num of numbers) {
    sum += num;
    squares += num * num;
    // Add some computation complexity
    Math.sqrt(num * num + 1);
  }

  res.json({
    sum,
    squares,
    average: sum / numbers.length,
    count: numbers.length,
    computed: Date.now()
  });
});

app.listen(${serverConfig.port}, () => {
  console.log('Express test server running on port ${serverConfig.port}');
});
`;

  await fs.writeFile(path.join(__dirname, 'test-server-express.js'), serverCode);

  serverConfig.process = spawn('node', [path.join(__dirname, 'test-server-express.js')], {
    stdio: 'pipe',
    detached: false
  });
}

/**
 * Start Fastify test server
 */
async function startFastifyServer(serverConfig) {
  const serverCode = `
const fastify = require('fastify')({ logger: false });
const crypto = require('crypto');

// Middleware for timing
fastify.addHook('onRequest', async (request, reply) => {
  request.startTime = performance.now();
});

// Routes
fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello from Fastify!', timestamp: Date.now() };
});

fastify.post('/api/user', async (request, reply) => {
  const user = request.body;
  return {
    id: crypto.randomUUID(),
    ...user,
    created: Date.now()
  };
});

fastify.get('/api/users', async (request, reply) => {
  const page = parseInt(request.query.page) || 1;
  const limit = parseInt(request.query.limit) || 10;

  // Simulate database query
  const users = Array.from({length: limit}, (_, i) => ({
    id: crypto.randomUUID(),
    name: \`User \${(page - 1) * limit + i + 1}\`,
    email: \`user\${i + 1}@example.com\`,
    created: Date.now() - Math.random() * 86400000
  }));

  return {
    data: users,
    pagination: { page, limit, total: 10000 }
  };
});

fastify.post('/api/upload', async (request, reply) => {
  const size = request.body.length;
  return {
    message: 'File uploaded successfully',
    size: size,
    timestamp: Date.now()
  };
});

fastify.post('/api/compute', async (request, reply) => {
  const { numbers } = request.body;

  // CPU-intensive computation
  let sum = 0;
  let squares = 0;

  for (const num of numbers) {
    sum += num;
    squares += num * num;
    // Add some computation complexity
    Math.sqrt(num * num + 1);
  }

  return {
    sum,
    squares,
    average: sum / numbers.length,
    count: numbers.length,
    computed: Date.now()
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: ${serverConfig.port} });
    console.log('Fastify test server running on port ${serverConfig.port}');
  } catch (err) {
    process.exit(1);
  }
};
start();
`;

  await fs.writeFile(path.join(__dirname, 'test-server-fastify.js'), serverCode);

  serverConfig.process = spawn('node', [path.join(__dirname, 'test-server-fastify.js')], {
    stdio: 'pipe',
    detached: false
  });
}

/**
 * Benchmark a specific scenario
 */
async function benchmarkScenario(baseUrl, scenario) {
  const url = baseUrl + scenario.endpoint;
  const method = scenario.method || 'GET';
  const body = scenario.body;
  const headers = scenario.headers || {};

  // Warmup
  log(`Warming up ${scenario.name}...`);
  await runRequests(url, method, body, headers, BENCHMARK_CONFIG.warmupRequests, 10);

  // Actual benchmark
  log(`Benchmarking ${scenario.name}...`);
  const results = [];

  for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
    const result = await runRequests(
      url,
      method,
      body,
      headers,
      BENCHMARK_CONFIG.testRequests,
      BENCHMARK_CONFIG.concurrency
    );
    results.push(result);
  }

  // Calculate statistics
  const stats = calculateStats(results);
  return stats;
}

/**
 * Run HTTP requests with concurrency
 */
async function runRequests(url, method, body, headers, totalRequests, concurrency) {
  const startTime = performance.now();
  const results = [];
  const errors = [];

  const makeRequest = async () => {
    const requestStart = performance.now();
    try {
      const response = await fetch(url, {
        method,
        body,
        headers,
        signal: AbortSignal.timeout(BENCHMARK_CONFIG.timeout)
      });

      const requestEnd = performance.now();
      const latency = requestEnd - requestStart;

      if (!response.ok) {
        errors.push(`HTTP ${response.status}`);
        return { success: false, latency, status: response.status };
      }

      const data = await response.json();
      return { success: true, latency, status: response.status, data };

    } catch (error) {
      const requestEnd = performance.now();
      const latency = requestEnd - requestStart;
      errors.push(error.message);
      return { success: false, latency, error: error.message };
    }
  };

  // Execute requests with concurrency control
  const batches = [];
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batchSize = Math.min(concurrency, totalRequests - i);
    const batch = Array.from({ length: batchSize }, makeRequest);
    batches.push(batch);
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const latencies = results.map(r => r.latency);

  return {
    totalRequests,
    successful,
    failed,
    totalTime,
    rps: (successful / totalTime) * 1000,
    latency: {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99)
    },
    errors: [...new Set(errors)]
  };
}

/**
 * Calculate percentile
 */
function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Calculate statistics from multiple runs
 */
function calculateStats(results) {
  const rps = results.map(r => r.rps);
  const latencies = results.flatMap(r => Object.values(r.latency).filter(v => typeof v === 'number'));

  return {
    rps: {
      min: Math.min(...rps),
      max: Math.max(...rps),
      mean: rps.reduce((a, b) => a + b, 0) / rps.length,
      median: percentile(rps, 50)
    },
    latency: {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99)
    },
    totalRequests: results.reduce((sum, r) => sum + r.totalRequests, 0),
    successful: results.reduce((sum, r) => sum + r.successful, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    iterations: results.length
  };
}

/**
 * Stop all test servers
 */
async function stopTestServers(servers) {
  for (const [name, server] of Object.entries(servers)) {
    if (server.process) {
      server.process.kill('SIGTERM');
      log(`Stopped ${name} server`);
    }
  }

  // Clean up temporary files
  const tempFiles = [
    'test-server-nexure.js',
    'test-server-express.js',
    'test-server-fastify.js'
  ];

  for (const file of tempFiles) {
    try {
      await fs.unlink(path.join(__dirname, file));
    } catch (error) {
      // Ignore errors when cleaning up
    }
  }
}

/**
 * Generate summary report
 */
function generateSummary() {
  const summary = {
    scenarios: Object.keys(results.scenarios).length,
    frameworks: [],
    winner: {},
    performance: {}
  };

  // Extract framework names
  const firstScenario = Object.values(results.scenarios)[0];
  if (firstScenario && firstScenario.results) {
    summary.frameworks = Object.keys(firstScenario.results);
  }

  // Calculate winners for each scenario
  for (const [scenarioName, scenario] of Object.entries(results.scenarios)) {
    if (!scenario.results) continue;

    let bestFramework = null;
    let bestRps = 0;

    for (const [framework, result] of Object.entries(scenario.results)) {
      if (result.rps && result.rps.mean > bestRps) {
        bestRps = result.rps.mean;
        bestFramework = framework;
      }
    }

    summary.winner[scenarioName] = {
      framework: bestFramework,
      rps: bestRps
    };
  }

  results.summary = summary;
}

/**
 * Save results to file
 */
async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `real-world-benchmark-${timestamp}.json`;
  const filepath = path.join(__dirname, 'results', filename);

  // Ensure results directory exists
  await fs.mkdir(path.join(__dirname, 'results'), { recursive: true });

  await fs.writeFile(filepath, JSON.stringify(results, null, 2));
  log(`Results saved to ${filepath}`);

  return filepath;
}

/**
 * Main execution
 */
async function main() {
  try {
    log('Starting Real-World Benchmarks for NexureJS');
    log(`Configuration: ${JSON.stringify(BENCHMARK_CONFIG, null, 2)}`);

    await runHttpBenchmarks();
    generateSummary();

    const resultsFile = await saveResults();

    log('Benchmark Summary:');
    console.log(JSON.stringify(results.summary, null, 2));

    log(`\nComplete results saved to: ${resultsFile}`);
    log('Real-world benchmarks completed successfully!');

  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as runRealWorldBenchmarks };
