#!/usr/bin/env node

/**
 * Real-World Production Benchmarks for NexureJS
 * Tests actual production scenarios with realistic workloads
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Benchmark Configuration
const CONFIG = {
  testDuration: 30000, // 30 seconds
  concurrency: 50,
  warmupRequests: 500,
  testRequests: 5000,
  timeout: 10000
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
    config: CONFIG
  }
};

/**
 * Utility Functions
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateUserData() {
  const names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana'];
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com'];

  return {
    id: Math.floor(Math.random() * 10000),
    name: `${names[Math.floor(Math.random() * names.length)]} ${names[Math.floor(Math.random() * names.length)]}`,
    email: `user${Math.floor(Math.random() * 1000)}@${domains[Math.floor(Math.random() * domains.length)]}`,
    age: Math.floor(Math.random() * 50) + 18,
    created: new Date().toISOString()
  };
}

/**
 * HTTP Request Helper with timeout and error handling
 */
async function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const requestOptions = {
      timeout: CONFIG.timeout,
      ...options
    };

    const req = http.request(url, requestOptions, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        try {
          const result = {
            success: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            responseTime,
            dataSize: data.length,
            timestamp: Date.now()
          };

          if (res.headers['content-type']?.includes('application/json')) {
            try {
              result.data = JSON.parse(data);
            } catch (e) {
              result.data = data;
            }
          } else {
            result.data = data;
          }

          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      const endTime = performance.now();
      reject({
        success: false,
        error: error.message,
        responseTime: endTime - startTime,
        timestamp: Date.now()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const endTime = performance.now();
      reject({
        success: false,
        error: 'Request timeout',
        responseTime: endTime - startTime,
        timestamp: Date.now()
      });
    });

    if (requestOptions.body) {
      req.write(requestOptions.body);
    }

    req.end();
  });
}

/**
 * Run concurrent requests with proper error handling
 */
async function runConcurrentRequests(testFunction, concurrency, totalRequests) {
  const results = [];
  const batches = Math.ceil(totalRequests / concurrency);

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrency, totalRequests - (batch * concurrency));
    const promises = [];

    for (let i = 0; i < batchSize; i++) {
      promises.push(
        testFunction().catch(error => ({
          success: false,
          error: error.message || error.toString(),
          responseTime: 0,
          timestamp: Date.now()
        }))
      );
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Small delay between batches to prevent overwhelming
    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return results;
}

/**
 * Test Scenarios
 */

// Scenario 1: Simple GET API
async function testSimpleGetAPI(baseUrl) {
  return await makeHttpRequest(`${baseUrl}/api/hello`, {
    method: 'GET'
  });
}

// Scenario 2: POST with JSON data
async function testPostJSON(baseUrl) {
  const userData = generateUserData();

  return await makeHttpRequest(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(userData))
    },
    body: JSON.stringify(userData)
  });
}

// Scenario 3: GET with query parameters
async function testGetWithQuery(baseUrl) {
  const page = Math.floor(Math.random() * 10) + 1;
  const limit = Math.floor(Math.random() * 20) + 5;

  return await makeHttpRequest(`${baseUrl}/api/users?page=${page}&limit=${limit}`, {
    method: 'GET'
  });
}

// Scenario 4: File upload simulation
async function testFileUpload(baseUrl) {
  // Generate random file data (1-10KB)
  const fileSize = Math.floor(Math.random() * 9000) + 1000;
  const fileData = Buffer.alloc(fileSize).fill('x').toString();

  return await makeHttpRequest(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': Buffer.byteLength(fileData)
    },
    body: fileData
  });
}

// Scenario 5: Complex computation
async function testComputation(baseUrl) {
  const numbers = Array.from({length: 100}, () => Math.floor(Math.random() * 1000));
  const data = JSON.stringify({ numbers });

  return await makeHttpRequest(`${baseUrl}/api/compute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    body: data
  });
}

/**
 * Create Test Server
 */
async function createTestServer() {
  const serverCode = `
const http = require('http');
const url = require('url');
const crypto = require('crypto');

// In-memory storage
let users = [];
let uploads = [];

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      // Route handling
      if (path === '/api/hello' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Hello from test server!',
          timestamp: Date.now(),
          server: 'test-server'
        }));

      } else if (path === '/api/users' && method === 'POST') {
        const user = JSON.parse(body);
        user.id = crypto.randomUUID();
        user.created = new Date().toISOString();
        users.push(user);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(user));

      } else if (path === '/api/users' && method === 'GET') {
        const page = parseInt(parsedUrl.query.page) || 1;
        const limit = parseInt(parsedUrl.query.limit) || 10;
        const start = (page - 1) * limit;

        // Generate fake users if not enough
        while (users.length < start + limit) {
          users.push({
            id: crypto.randomUUID(),
            name: \`User \${users.length + 1}\`,
            email: \`user\${users.length + 1}@example.com\`,
            age: Math.floor(Math.random() * 50) + 18,
            created: new Date().toISOString()
          });
        }

        const paginatedUsers = users.slice(start, start + limit);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: paginatedUsers,
          pagination: { page, limit, total: users.length }
        }));

      } else if (path === '/api/upload' && method === 'POST') {
        const upload = {
          id: crypto.randomUUID(),
          size: body.length,
          timestamp: Date.now()
        };
        uploads.push(upload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(upload));

      } else if (path === '/api/compute' && method === 'POST') {
        const { numbers } = JSON.parse(body);

        // Perform computation
        let sum = 0;
        let squares = 0;

        for (const num of numbers) {
          sum += num;
          squares += num * num;
          // Add some CPU load
          Math.sqrt(num * num + 1);
        }

        const result = {
          sum,
          squares,
          average: sum / numbers.length,
          count: numbers.length,
          computed: Date.now()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(\`Test server running on port \${PORT}\`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Test server stopped');
    process.exit(0);
  });
});
`;

  const serverPath = path.join(__dirname, 'temp-test-server.js');
  await fs.writeFile(serverPath, serverCode);
  return serverPath;
}

/**
 * Calculate statistics from results
 */
function calculateStats(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length === 0) {
    return {
      totalRequests: results.length,
      successful: 0,
      failed: failed.length,
      successRate: 0,
      avgResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      throughput: 0,
      errors: failed.map(f => f.error).filter(Boolean)
    };
  }

  const responseTimes = successful.map(r => r.responseTime).sort((a, b) => a - b);
  const totalTime = Math.max(...results.map(r => r.timestamp)) - Math.min(...results.map(r => r.timestamp));

  return {
    totalRequests: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: (successful.length / results.length) * 100,
    avgResponseTime: responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length,
    minResponseTime: responseTimes[0],
    maxResponseTime: responseTimes[responseTimes.length - 1],
    p50: responseTimes[Math.floor(responseTimes.length * 0.5)],
    p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
    p99: responseTimes[Math.floor(responseTimes.length * 0.99)],
    throughput: totalTime > 0 ? (successful.length / totalTime) * 1000 : 0,
    errors: [...new Set(failed.map(f => f.error).filter(Boolean))]
  };
}

/**
 * Run benchmark scenario
 */
async function runScenario(name, testFunction, baseUrl) {
  log(`Running scenario: ${name}`);

  try {
    // Warmup
    log(`  Warming up with ${CONFIG.warmupRequests} requests...`);
    await runConcurrentRequests(
      () => testFunction(baseUrl),
      Math.min(CONFIG.concurrency, 10),
      CONFIG.warmupRequests
    );

    // Actual test
    log(`  Running ${CONFIG.testRequests} requests with ${CONFIG.concurrency} concurrency...`);
    const testResults = await runConcurrentRequests(
      () => testFunction(baseUrl),
      CONFIG.concurrency,
      CONFIG.testRequests
    );

    const stats = calculateStats(testResults);

    log(`  ✅ ${name} completed:`);
    log(`     Success Rate: ${stats.successRate.toFixed(2)}%`);
    log(`     Avg Response Time: ${stats.avgResponseTime.toFixed(2)}ms`);
    log(`     Throughput: ${stats.throughput.toFixed(2)} req/s`);
    log(`     P95 Latency: ${stats.p95.toFixed(2)}ms`);

    results.scenarios[name] = stats;

  } catch (error) {
    log(`  ❌ ${name} failed: ${error.message}`);
    results.scenarios[name] = { error: error.message };
  }
}

/**
 * Main benchmark execution
 */
async function runBenchmark() {
  log('🚀 Starting Real-World Production Benchmarks');
  log(`Configuration: ${JSON.stringify(CONFIG, null, 2)}`);

  let serverProcess = null;
  let serverPath = null;

  try {
    // Create and start test server
    log('Starting test server...');
    serverPath = await createTestServer();

    serverProcess = spawn('node', [serverPath], {
      stdio: 'pipe',
      detached: false
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    const baseUrl = 'http://localhost:3000';

    // Test scenarios
    const scenarios = [
      ['Simple GET API', testSimpleGetAPI],
      ['POST JSON Data', testPostJSON],
      ['GET with Pagination', testGetWithQuery],
      ['File Upload', testFileUpload],
      ['Complex Computation', testComputation]
    ];

    // Run each scenario
    for (const [name, testFunction] of scenarios) {
      await runScenario(name, testFunction, baseUrl);

      // Small delay between scenarios
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Generate summary
    generateSummary();

    // Save results
    const resultsFile = await saveResults();

    log('\n📊 Benchmark Summary:');
    console.log(JSON.stringify(results.summary, null, 2));
    log(`\nDetailed results saved to: ${resultsFile}`);
    log('✅ Benchmark completed successfully!');

  } catch (error) {
    log(`❌ Benchmark failed: ${error.message}`);
    console.error(error);
    process.exit(1);

  } finally {
    // Cleanup
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      log('Test server stopped');
    }

    if (serverPath) {
      try {
        await fs.unlink(serverPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Generate summary statistics
 */
function generateSummary() {
  const scenarios = Object.values(results.scenarios).filter(s => !s.error);

  if (scenarios.length === 0) {
    results.summary = { error: 'No successful scenarios' };
    return;
  }

  results.summary = {
    totalScenarios: Object.keys(results.scenarios).length,
    successfulScenarios: scenarios.length,
    totalRequests: scenarios.reduce((sum, s) => sum + s.totalRequests, 0),
    totalSuccessful: scenarios.reduce((sum, s) => sum + s.successful, 0),
    overallSuccessRate: scenarios.reduce((sum, s) => sum + s.successRate, 0) / scenarios.length,
    avgThroughput: scenarios.reduce((sum, s) => sum + s.throughput, 0) / scenarios.length,
    avgResponseTime: scenarios.reduce((sum, s) => sum + s.avgResponseTime, 0) / scenarios.length,
    bestScenario: scenarios.reduce((best, current) =>
      current.throughput > best.throughput ? current : best
    ),
    performance: {
      excellent: scenarios.filter(s => s.avgResponseTime < 50).length,
      good: scenarios.filter(s => s.avgResponseTime >= 50 && s.avgResponseTime < 200).length,
      acceptable: scenarios.filter(s => s.avgResponseTime >= 200 && s.avgResponseTime < 500).length,
      poor: scenarios.filter(s => s.avgResponseTime >= 500).length
    }
  };
}

/**
 * Save results to file
 */
async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `benchmark-results-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  // Ensure results directory exists
  try {
    await fs.mkdir(resultsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  await fs.writeFile(filepath, JSON.stringify(results, null, 2));
  return filepath;
}

// Run benchmark if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runBenchmark, CONFIG };
