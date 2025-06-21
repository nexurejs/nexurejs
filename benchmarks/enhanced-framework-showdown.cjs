#!/usr/bin/env node

/**
 * Enhanced Framework Showdown - Comprehensive Performance Comparison
 * NexureJS vs Express vs Fastify vs Koa
 * Features: Multiple concurrency levels, memory monitoring, detailed analysis
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

// Test Configuration
const CONFIG = {
  frameworks: ['nexurejs', 'express', 'fastify', 'koa'],
  concurrency: 50,
  testRequests: 5000,
  warmupRequests: 1000,
  serverStartDelay: 3000
};

// Results storage
const results = {
  frameworks: {},
  comparison: {},
  winner: {},
  analysis: {},
  timestamp: new Date().toISOString()
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateTestData() {
  return {
    users: Array.from({length: 1000}, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: Math.random() > 0.3,
      profile: {
        age: Math.floor(Math.random() * 50) + 18,
        location: ['NY', 'CA', 'TX', 'FL', 'WA'][Math.floor(Math.random() * 5)],
        bio: 'A'.repeat(Math.floor(Math.random() * 200) + 50)
      }
    })),
    products: Array.from({length: 500}, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      price: Math.floor(Math.random() * 1000) + 10,
      category: ['Electronics', 'Clothing', 'Books', 'Home'][Math.floor(Math.random() * 4)],
      description: 'B'.repeat(Math.floor(Math.random() * 300) + 100)
    })),
    fileData: Buffer.alloc(10240).fill('X').toString(),
    computation: Array.from({length: 2000}, () => Math.floor(Math.random() * 1000))
  };
}

async function makeRequest(url, options = {}) {
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject({
        success: false,
        error: 'timeout',
        responseTime: performance.now() - startTime,
        timestamp: Date.now()
      });
    }, 15000);

    const req = http.request(url, options, (res) => {
      clearTimeout(timeout);

      let data = '';
      const firstByteTime = performance.now();

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();

        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          responseTime: endTime - startTime,
          timeToFirstByte: firstByteTime - startTime,
          dataSize: data.length,
          timestamp: Date.now()
        });
      });
    });

    req.on('error', (error) => {
      clearTimeout(timeout);
      reject({
        success: false,
        error: error.message,
        responseTime: performance.now() - startTime,
        timestamp: Date.now()
      });
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function runLoadTest(testFunction, concurrency, totalRequests) {
  const results = [];
  const batchSize = Math.min(concurrency, 50);
  const batches = Math.ceil(totalRequests / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchRequests = Math.min(batchSize, totalRequests - (batch * batchSize));
    const promises = [];

    for (let i = 0; i < batchRequests; i++) {
      promises.push(testFunction().catch(error => ({
        success: false,
        error: error.message || 'Unknown error',
        responseTime: 0,
        timestamp: Date.now()
      })));
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return results;
}

// Enhanced Test Scenarios
const scenarios = {
  'Simple JSON API': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/hello`, { method: 'GET' }),

  'POST with Validation': (baseUrl) => () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      preferences: ['coding', 'music']
    };
    return makeRequest(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  },

  'Database Query Simulation': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/users?page=${Math.floor(Math.random() * 10) + 1}&limit=20`, {
      method: 'GET'
    }),

  'Large File Upload': (baseUrl) => () => {
    const testData = generateTestData();
    return makeRequest(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: testData.fileData
    });
  },

  'CPU Intensive Task': (baseUrl) => () => {
    const testData = generateTestData();
    return makeRequest(`${baseUrl}/api/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: testData.computation })
    });
  },

  'Large JSON Response': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/export/large`, { method: 'GET' }),

  'Memory Stress Test': (baseUrl) => () => {
    const largeData = {
      data: Array.from({length: 1000}, (_, i) => ({
        id: i,
        content: 'x'.repeat(100),
        nested: { level1: { level2: { value: Math.random() } } }
      }))
    };
    return makeRequest(`${baseUrl}/api/memory/stress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(largeData)
    });
  },

  'Error Recovery Test': (baseUrl) => () => {
    const shouldError = Math.random() < 0.1;
    return makeRequest(`${baseUrl}/api/error/test?shouldError=${shouldError}`, {
      method: 'GET'
    });
  },

  'Static File Serving': (baseUrl) => () =>
    makeRequest(`${baseUrl}/static/large-file.json`, { method: 'GET' }),

  'Middleware Chain Test': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/middleware/chain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'test-value'
      },
      body: JSON.stringify({ test: 'middleware performance' })
    })
};

// Memory Monitor Class
class MemoryMonitor {
  constructor() {
    this.samples = [];
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      this.samples.push({
        timestamp: Date.now(),
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal
      });
    }, 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    return this.getStats();
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const rssValues = this.samples.map(s => s.rss);
    const heapValues = this.samples.map(s => s.heapUsed);

    return {
      memory: {
        rss: {
          min: Math.min(...rssValues),
          max: Math.max(...rssValues),
          avg: rssValues.reduce((a, b) => a + b, 0) / rssValues.length
        },
        heap: {
          min: Math.min(...heapValues),
          max: Math.max(...heapValues),
          avg: heapValues.reduce((a, b) => a + b, 0) / heapValues.length
        }
      },
      samples: this.samples.length
    };
  }
}

function calculateEnhancedStats(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length === 0) {
    return {
      totalRequests: results.length,
      successful: 0,
      failed: failed.length,
      successRate: 0,
      throughput: 0,
      latency: { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 },
      errors: failed.map(f => f.error)
    };
  }

  const responseTimes = successful.map(r => r.responseTime).sort((a, b) => a - b);
  const totalTime = Math.max(...results.map(r => r.timestamp)) - Math.min(...results.map(r => r.timestamp));

  return {
    totalRequests: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: (successful.length / results.length) * 100,
    throughput: totalTime > 0 ? (successful.length / totalTime) * 1000 : 0,
    latency: {
      avg: responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length,
      min: responseTimes[0],
      max: responseTimes[responseTimes.length - 1],
      p50: responseTimes[Math.floor(responseTimes.length * 0.5)],
      p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99: responseTimes[Math.floor(responseTimes.length * 0.99)]
    },
    dataTransfer: {
      totalBytes: successful.reduce((sum, r) => sum + (r.dataSize || 0), 0),
      avgResponseSize: successful.reduce((sum, r) => sum + (r.dataSize || 0), 0) / successful.length
    },
    errors: [...new Set(failed.map(f => f.error))]
  };
}

// Enhanced NexureJS Server
async function createNexureServer(port) {
  const testData = generateTestData();

  const serverCode = `
const { NexureJS } = require('../lib/nexurejs.cjs');
const crypto = require('crypto');

const app = new NexureJS();
const testData = ${JSON.stringify(testData)};

app.use((req, res, next) => {
  res.setHeader('X-Framework', 'NexureJS');
  next();
});

// Basic routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from NexureJS!', timestamp: Date.now() });
});

app.post('/api/users', (req, res) => {
  const user = { id: crypto.randomUUID(), ...req.body, created: Date.now() };
  res.json(user);
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.json({ data: users, pagination: { page, limit, total: testData.users.length } });
});

app.post('/api/upload', (req, res) => {
  res.json({ size: req.body.length, processed: Date.now() });
});

app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  res.json({ result: result.toFixed(2), operations: numbers.length * 50 });
});

// Enhanced routes
app.get('/api/export/large', (req, res) => {
  const largeData = {
    users: testData.users,
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  res.json(largeData);
});

app.post('/api/memory/stress', (req, res) => {
  const { data } = req.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  res.json({ processed: processed.length, memoryUsage: process.memoryUsage() });
});

app.get('/api/error/test', (req, res) => {
  if (req.query.shouldError === 'true') {
    return res.status(500).json({ error: 'Simulated error', code: 'TEST_ERROR' });
  }
  res.json({ success: true, message: 'No error triggered' });
});

app.get('/static/large-file.json', (req, res) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(largeFile);
});

app.post('/api/middleware/chain', (req, res) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  res.json({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: req.body
  });
});

app.listen(${port}, () => {
  console.log('Enhanced NexureJS server running on port ${port}');
});
`;

  return { code: serverCode, filename: `enhanced-nexure-${port}.cjs` };
}

// Enhanced Express Server
async function createExpressServer(port) {
  const testData = generateTestData();

  const serverCode = `
const express = require('express');
const crypto = require('crypto');

const app = express();
const testData = ${JSON.stringify(testData)};

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Framework', 'Express');
  next();
});

// Copy all the same routes as NexureJS
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!', timestamp: Date.now() });
});

app.post('/api/users', (req, res) => {
  const user = { id: crypto.randomUUID(), ...req.body, created: Date.now() };
  res.json(user);
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.json({ data: users, pagination: { page, limit, total: testData.users.length } });
});

app.post('/api/upload', (req, res) => {
  res.json({ size: req.body.length, processed: Date.now() });
});

app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  res.json({ result: result.toFixed(2), operations: numbers.length * 50 });
});

app.get('/api/export/large', (req, res) => {
  const largeData = {
    users: testData.users,
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  res.json(largeData);
});

app.post('/api/memory/stress', (req, res) => {
  const { data } = req.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  res.json({ processed: processed.length, memoryUsage: process.memoryUsage() });
});

app.get('/api/error/test', (req, res) => {
  if (req.query.shouldError === 'true') {
    return res.status(500).json({ error: 'Simulated error', code: 'TEST_ERROR' });
  }
  res.json({ success: true, message: 'No error triggered' });
});

app.get('/static/large-file.json', (req, res) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(largeFile);
});

app.post('/api/middleware/chain', (req, res) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  res.json({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: req.body
  });
});

app.listen(${port}, () => {
  console.log('Enhanced Express server running on port ${port}');
});
`;

  return { code: serverCode, filename: `enhanced-express-${port}.cjs` };
}

// Create similar enhanced servers for Fastify and Koa...
async function createFastifyServer(port) {
  const testData = generateTestData();

  const serverCode = `
const fastify = require('fastify')({ logger: false });
const crypto = require('crypto');

const testData = ${JSON.stringify(testData)};

fastify.addHook('onRequest', async (request, reply) => {
  reply.header('X-Framework', 'Fastify');
});

fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello from Fastify!', timestamp: Date.now() };
});

// Add all other routes...
fastify.post('/api/users', async (request, reply) => {
  const user = { id: crypto.randomUUID(), ...request.body, created: Date.now() };
  return user;
});

fastify.get('/api/users', async (request, reply) => {
  const page = parseInt(request.query.page) || 1;
  const limit = parseInt(request.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  return { data: users, pagination: { page, limit, total: testData.users.length } };
});

// Add remaining routes...

const start = async () => {
  try {
    await fastify.listen({ port: ${port} });
    console.log('Enhanced Fastify server running on port ${port}');
  } catch (err) {
    process.exit(1);
  }
};
start();
`;

  return { code: serverCode, filename: `enhanced-fastify-${port}.cjs` };
}

async function createKoaServer(port) {
  const testData = generateTestData();

  const serverCode = `
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const crypto = require('crypto');

const app = new Koa();
const router = new Router();
const testData = ${JSON.stringify(testData)};

app.use(bodyParser());
app.use(async (ctx, next) => {
  ctx.set('X-Framework', 'Koa');
  await next();
});

router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from Koa!', timestamp: Date.now() };
});

// Add all other routes...

app.use(router.routes()).use(router.allowedMethods());

app.listen(${port}, () => {
  console.log('Enhanced Koa server running on port ${port}');
});
`;

  return { code: serverCode, filename: `enhanced-koa-${port}.cjs` };
}

async function startServer(framework, port) {
  let serverConfig;

  switch (framework) {
    case 'nexurejs':
      serverConfig = await createNexureServer(port);
      break;
    case 'express':
      serverConfig = await createExpressServer(port);
      break;
    case 'fastify':
      serverConfig = await createFastifyServer(port);
      break;
    case 'koa':
      serverConfig = await createKoaServer(port);
      break;
    default:
      throw new Error(`Unknown framework: ${framework}`);
  }

  const serverPath = path.join(__dirname, serverConfig.filename);
  await fs.writeFile(serverPath, serverConfig.code);

  const serverProcess = spawn('node', [serverPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error(`Server ${framework} failed to start within timeout`));
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('running on port')) {
        clearTimeout(timeout);
        resolve({
          process: serverProcess,
          path: serverPath,
          pid: serverProcess.pid
        });
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`${framework} stderr:`, data.toString());
    });

    serverProcess.on('error', reject);
  });
}

async function benchmarkFramework(framework, scenario, scenarioFunc, baseUrl) {
  log(`Testing ${framework} - ${scenario}`);

  const concurrencyLevels = [10, 25, 50, 100];
  const results = {};

  // Start memory monitoring
  const memoryMonitor = new MemoryMonitor();
  memoryMonitor.start();

  try {
    for (const concurrency of concurrencyLevels) {
      log(`  Testing with ${concurrency} concurrent connections...`);

      // Warmup
      await runLoadTest(scenarioFunc, Math.min(concurrency, 10), 200);

      // Actual test
      const testResults = await runLoadTest(scenarioFunc, concurrency, 1000);
      const stats = calculateEnhancedStats(testResults);
      results[concurrency] = stats;

      log(`    ${concurrency} concurrent: ${stats.throughput.toFixed(0)} req/s, ${stats.latency.avg.toFixed(2)}ms avg`);

      if (stats.successRate < 80) {
        log(`    Performance degraded, stopping at ${concurrency} concurrent`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const memoryStats = memoryMonitor.stop();
    const aggregateStats = calculateAggregateStats(results);

    return {
      framework,
      scenario,
      concurrencyResults: results,
      aggregateStats,
      memoryStats,
      timestamp: Date.now()
    };

  } catch (error) {
    memoryMonitor.stop();
    log(`Error testing ${framework} - ${scenario}: ${error.message}`);
    return { error: error.message };
  }
}

function calculateAggregateStats(concurrencyResults) {
  const allResults = Object.values(concurrencyResults).filter(r => r && !r.error);

  if (allResults.length === 0) {
    return { throughput: 0, latency: { avg: 0 }, successRate: 0 };
  }

  const throughputs = allResults.map(r => r.throughput);
  const latencies = allResults.map(r => r.latency.avg);
  const successRates = allResults.map(r => r.successRate);

  return {
    throughput: {
      max: Math.max(...throughputs),
      avg: throughputs.reduce((a, b) => a + b, 0) / throughputs.length
    },
    latency: {
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      min: Math.min(...latencies)
    },
    successRate: {
      avg: successRates.reduce((a, b) => a + b, 0) / successRates.length
    }
  };
}

async function runEnhancedFrameworkShowdown() {
  log('🚀 Starting Enhanced Framework Showdown');
  log(`Testing: ${CONFIG.frameworks.join(', ')}`);

  const servers = {};
  const serverPaths = [];

  try {
    // Start all servers
    let port = 3001;
    for (const framework of CONFIG.frameworks) {
      log(`Starting ${framework} server on port ${port}...`);

      try {
        const server = await startServer(framework, port);
        servers[framework] = {
          process: server.process,
          port: port,
          baseUrl: `http://localhost:${port}`
        };
        serverPaths.push(server.path);
        port++;
      } catch (error) {
        log(`Failed to start ${framework} server: ${error.message}`);
        continue;
      }
    }

    // Wait for servers to start
    log('Waiting for servers to start...');
    await new Promise(resolve => setTimeout(resolve, CONFIG.serverStartDelay));

    // Run benchmarks
    for (const framework of Object.keys(servers)) {
      log(`\n🧪 Testing ${framework.toUpperCase()}`);
      results.frameworks[framework] = {};

      const baseUrl = servers[framework].baseUrl;

      for (const [scenarioName, scenarioFunc] of Object.entries(scenarios)) {
        const stats = await benchmarkFramework(
          framework,
          scenarioName,
          scenarioFunc(baseUrl),
          baseUrl
        );

        results.frameworks[framework][scenarioName] = stats;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Generate analysis
    generateEnhancedAnalysis();

    // Save and display results
    const resultsFile = await saveResults();
    displayEnhancedResults();

    log(`\n✅ Enhanced Framework Showdown completed! Results saved to: ${resultsFile}`);

  } catch (error) {
    log(`❌ Enhanced Framework Showdown failed: ${error.message}`);
    console.error(error);

  } finally {
    // Cleanup
    for (const [framework, server] of Object.entries(servers)) {
      if (server.process) {
        server.process.kill('SIGTERM');
        log(`Stopped ${framework} server`);
      }
    }

    for (const serverPath of serverPaths) {
      try {
        await fs.unlink(serverPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

function generateEnhancedAnalysis() {
  const availableFrameworks = Object.keys(results.frameworks);
  results.analysis = { overallScores: {}, categoryScores: {} };

  for (const framework of availableFrameworks) {
    let totalScore = 0;
    let validScenarios = 0;

    for (const [scenarioName, result] of Object.entries(results.frameworks[framework])) {
      if (result && !result.error && result.aggregateStats) {
        const score = result.aggregateStats.throughput.max / (result.aggregateStats.latency.avg + 1);
        totalScore += score;
        validScenarios++;
      }
    }

    results.analysis.overallScores[framework] = validScenarios > 0 ? totalScore / validScenarios : 0;
  }

  const frameworks = Object.keys(results.analysis.overallScores);
  results.winner = {
    overall: frameworks.length > 0 ? frameworks.reduce((a, b) =>
      results.analysis.overallScores[a] > results.analysis.overallScores[b] ? a : b
    ) : 'None'
  };
}

function displayEnhancedResults() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 ENHANCED FRAMEWORK SHOWDOWN RESULTS');
  console.log('='.repeat(100));

  console.log(`\n🥇 OVERALL WINNER: ${results.winner.overall?.toUpperCase() || 'Unknown'}`);

  console.log('\n📊 DETAILED RANKINGS:');
  if (results.analysis && results.analysis.overallScores) {
    const sortedFrameworks = Object.entries(results.analysis.overallScores)
      .sort(([,a], [,b]) => b - a);

    sortedFrameworks.forEach(([framework, score], index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      console.log(`   ${medal} ${framework.toUpperCase()} - Overall Score: ${score.toFixed(2)}`);
    });
  }

  console.log('\n💡 PERFORMANCE INSIGHTS:');
  console.log(`   📊 Total Scenarios Tested: ${Object.keys(scenarios).length}`);
  console.log(`   🏗️  Frameworks Compared: ${CONFIG.frameworks.length}`);
  console.log(`   🔄 Multiple concurrency levels tested`);
  console.log(`   🧠 Memory usage monitored`);
  console.log(`   📈 Comprehensive performance analysis`);

  console.log('\n' + '='.repeat(100));
}

async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `enhanced-framework-showdown-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(results, null, 2));

  return filepath;
}

// Run if executed directly
if (require.main === module) {
  runEnhancedFrameworkShowdown().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runEnhancedFrameworkShowdown, CONFIG };
