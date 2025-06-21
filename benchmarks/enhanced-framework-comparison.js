#!/usr/bin/env node

/**
 * Enhanced Framework Comparison Benchmark
 * Comprehensive performance testing across multiple Node.js frameworks
 * Features: Memory monitoring, error injection, scalability testing, detailed analysis
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  testDuration: 60000,
  concurrency: [10, 50, 100, 200, 500],
  warmupRequests: 1000,
  testRequests: 10000,
  serverStartDelay: 3000,
  memoryCheckInterval: 500,
  frameworks: ['nexurejs', 'express', 'fastify', 'koa'],
  payloadSizes: {
    tiny: 10,
    small: 1024,
    medium: 10240,
    large: 102400,
    huge: 1048576
  },
  errorInjection: {
    enabled: true,
    rate: 0.02 // 2% error rate
  }
};

// Results storage
const results = {
  summary: {},
  detailed: {},
  analysis: {},
  scalability: {},
  memory: {},
  errors: {},
  metadata: {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: os.cpus().length,
      memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
    }
  }
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Test data generator
function generateTestData(size = 'medium') {
  const payloadSize = CONFIG.payloadSizes[size];
  return {
    users: Array.from({length: 1000}, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: Math.random() > 0.3,
      profile: {
        age: Math.floor(Math.random() * 50) + 18,
        location: ['NY', 'CA', 'TX', 'FL', 'WA'][Math.floor(Math.random() * 5)],
        bio: 'A'.repeat(Math.floor(Math.random() * 200) + 50),
        interests: Array.from({length: Math.floor(Math.random() * 10) + 1},
          () => Math.random().toString(36).substr(2, 8))
      },
      metadata: {
        created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        loginCount: Math.floor(Math.random() * 1000)
      }
    })),
    products: Array.from({length: 500}, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      price: Math.floor(Math.random() * 1000) + 10,
      category: ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'][Math.floor(Math.random() * 5)],
      description: 'B'.repeat(Math.floor(Math.random() * 300) + 100),
      tags: Array.from({length: Math.floor(Math.random() * 8) + 2},
        () => Math.random().toString(36).substr(2, 6)),
      reviews: Array.from({length: Math.floor(Math.random() * 50)}, () => ({
        rating: Math.floor(Math.random() * 5) + 1,
        comment: 'C'.repeat(Math.floor(Math.random() * 100) + 20)
      }))
    })),
    fileData: Buffer.alloc(payloadSize).fill('X').toString('base64'),
    computation: Array.from({length: 5000}, () => Math.floor(Math.random() * 1000)),
    largePayload: Array.from({length: 2000}, (_, i) => ({
      id: i,
      data: 'D'.repeat(100),
      nested: {
        level1: { level2: { level3: { value: Math.random() } } }
      }
    }))
  };
}

// Enhanced HTTP client with detailed metrics
async function makeRequest(url, options = {}) {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject({
        success: false,
        error: 'timeout',
        responseTime: performance.now() - startTime,
        timestamp: Date.now()
      });
    }, 30000);

    const req = http.request(url, options, (res) => {
      clearTimeout(timeout);

      let data = '';
      const firstByteTime = performance.now();
      let bytesReceived = 0;

      res.on('data', chunk => {
        data += chunk;
        bytesReceived += chunk.length;
      });

      res.on('end', () => {
        const endTime = performance.now();
        const endMemory = process.memoryUsage();

        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          responseTime: endTime - startTime,
          timeToFirstByte: firstByteTime - startTime,
          dataSize: bytesReceived,
          headers: res.headers,
          memoryDelta: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal
          },
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

// Memory monitoring class
class MemoryMonitor {
  constructor(pid) {
    this.pid = pid;
    this.samples = [];
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      this.sample();
    }, CONFIG.memoryCheckInterval);
  }

  sample() {
    if (process.platform === 'win32') {
      // Windows memory monitoring
      exec(`tasklist /FI "PID eq ${this.pid}" /FO CSV`, (error, stdout) => {
        if (!error && stdout) {
          const lines = stdout.trim().split('\n');
          if (lines.length > 1) {
            const data = lines[1].split(',');
            const memory = parseInt(data[4].replace(/[^0-9]/g, '')) * 1024; // Convert KB to bytes
            this.samples.push({
              timestamp: Date.now(),
              rss: memory,
              cpu: 0 // CPU monitoring on Windows is more complex
            });
          }
        }
      });
    } else {
      // Unix-like systems
      exec(`ps -p ${this.pid} -o pid,rss,pcpu`, (error, stdout) => {
        if (!error && stdout) {
          const lines = stdout.trim().split('\n');
          if (lines.length > 1) {
            const [, rss, cpu] = lines[1].trim().split(/\s+/);
            this.samples.push({
              timestamp: Date.now(),
              rss: parseInt(rss) * 1024, // Convert KB to bytes
              cpu: parseFloat(cpu)
            });
          }
        }
      });
    }
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
    const cpuValues = this.samples.map(s => s.cpu);

    return {
      memory: {
        min: Math.min(...rssValues),
        max: Math.max(...rssValues),
        avg: rssValues.reduce((a, b) => a + b, 0) / rssValues.length,
        samples: this.samples.length,
        growth: rssValues[rssValues.length - 1] - rssValues[0]
      },
      cpu: {
        min: Math.min(...cpuValues),
        max: Math.max(...cpuValues),
        avg: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length
      },
      timeline: this.samples
    };
  }
}

// Test scenarios
const scenarios = {
  // Basic Performance
  'hello_world': {
    name: 'Hello World',
    category: 'basic',
    description: 'Simple JSON response',
    path: '/api/hello',
    method: 'GET'
  },

  'json_post': {
    name: 'JSON POST',
    category: 'basic',
    description: 'JSON POST with validation',
    path: '/api/users',
    method: 'POST',
    body: () => JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    })
  },

  // Database Operations
  'paginated_query': {
    name: 'Paginated Query',
    category: 'database',
    description: 'Database query with pagination',
    path: '/api/users',
    method: 'GET',
    query: () => `?page=${Math.floor(Math.random() * 20) + 1}&limit=50`
  },

  'complex_query': {
    name: 'Complex Query',
    category: 'database',
    description: 'Complex database operation',
    path: '/api/analytics',
    method: 'GET'
  },

  'bulk_insert': {
    name: 'Bulk Insert',
    category: 'database',
    description: 'Bulk data insertion',
    path: '/api/bulk/users',
    method: 'POST',
    body: () => JSON.stringify({
      users: Array.from({length: 10}, (_, i) => ({
        name: `User ${i}`,
        email: `user${i}@test.com`
      }))
    })
  },

  // File Operations
  'small_upload': {
    name: 'Small File Upload',
    category: 'files',
    description: 'Upload 1KB file',
    path: '/api/upload',
    method: 'POST',
    body: () => generateTestData('small').fileData
  },

  'large_upload': {
    name: 'Large File Upload',
    category: 'files',
    description: 'Upload 100KB file',
    path: '/api/upload',
    method: 'POST',
    body: () => generateTestData('large').fileData
  },

  // Computation
  'cpu_intensive': {
    name: 'CPU Intensive',
    category: 'compute',
    description: 'Heavy computation task',
    path: '/api/compute',
    method: 'POST',
    body: () => JSON.stringify({
      numbers: Array.from({length: 1000}, () => Math.random() * 1000)
    })
  },

  'async_task': {
    name: 'Async Task',
    category: 'compute',
    description: 'Asynchronous processing',
    path: '/api/async',
    method: 'POST',
    body: () => JSON.stringify({
      task: 'process_data',
      data: Array.from({length: 100}, () => Math.random())
    })
  },

  // Memory Tests
  'large_response': {
    name: 'Large Response',
    category: 'memory',
    description: 'Large JSON response',
    path: '/api/export',
    method: 'GET'
  },

  'memory_stress': {
    name: 'Memory Stress',
    category: 'memory',
    description: 'Memory intensive operation',
    path: '/api/memory',
    method: 'POST',
    body: () => JSON.stringify({
      data: generateTestData('huge').largePayload
    })
  },

  // Error Handling
  'error_handling': {
    name: 'Error Handling',
    category: 'errors',
    description: 'Error handling and recovery',
    path: '/api/error',
    method: 'POST',
    body: () => JSON.stringify({
      type: 'validation',
      trigger: Math.random() < 0.3
    })
  },

  // Real-world Scenarios
  'api_gateway': {
    name: 'API Gateway',
    category: 'realistic',
    description: 'API gateway simulation',
    path: '/api/gateway',
    method: 'GET',
    query: () => `?service=${['user', 'order', 'inventory'][Math.floor(Math.random() * 3)]}`
  },

  'mixed_workload': {
    name: 'Mixed Workload',
    category: 'realistic',
    description: 'Mixed API operations',
    path: () => {
      const paths = ['/api/hello', '/api/users', '/api/products', '/api/stats'];
      return paths[Math.floor(Math.random() * paths.length)];
    },
    method: 'GET'
  }
};

// Load testing function
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

    // Rate limiting between batches
    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return results;
}

// Server creators
async function createNexureServer(port) {
  const testData = generateTestData();

  const serverCode = `
const { NexureJS } = require('../src/index.js');
const crypto = require('crypto');

const app = new NexureJS();
const testData = ${JSON.stringify(testData)};

app.use((req, res, next) => {
  res.setHeader('X-Framework', 'NexureJS');
  res.setHeader('X-Timestamp', Date.now());
  next();
});

// Basic routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello World', timestamp: Date.now() });
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
  res.json({
    data: users,
    pagination: { page, limit, total: testData.users.length }
  });
});

// Database operations
app.get('/api/analytics', (req, res) => {
  const analytics = {
    totalUsers: testData.users.length,
    activeUsers: testData.users.filter(u => u.active).length,
    avgAge: testData.users.reduce((sum, u) => sum + u.profile.age, 0) / testData.users.length,
    locationStats: testData.users.reduce((acc, u) => {
      acc[u.profile.location] = (acc[u.profile.location] || 0) + 1;
      return acc;
    }, {}),
    computed: Date.now()
  };
  res.json(analytics);
});

app.post('/api/bulk/users', (req, res) => {
  const { users } = req.body;
  const created = users.map(u => ({ ...u, id: crypto.randomUUID(), created: Date.now() }));
  res.json({ success: true, created: created.length, users: created });
});

// File operations
app.post('/api/upload', (req, res) => {
  const size = Buffer.byteLength(req.body);
  res.json({
    success: true,
    size,
    type: size < 1024 ? 'small' : size < 10240 ? 'medium' : 'large',
    processed: Date.now()
  });
});

// Compute operations
app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;
  let result = 0;

  // CPU intensive computation
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 100; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }

  res.json({
    result: result.toFixed(2),
    operations: numbers.length * 100,
    duration: Date.now() - req.startTime
  });
});

app.post('/api/async', (req, res) => {
  const { task, data } = req.body;

  // Simulate async processing
  setImmediate(() => {
    const processed = data.map(d => d * 2);
    // Would normally save to queue/database
  });

  res.json({
    taskId: crypto.randomUUID(),
    status: 'queued',
    estimated: 5000
  });
});

// Memory operations
app.get('/api/export', (req, res) => {
  res.json({
    users: testData.users,
    products: testData.products,
    exported: Date.now(),
    size: 'large'
  });
});

app.post('/api/memory', (req, res) => {
  const { data } = req.body;

  // Memory intensive processing
  const processed = data.map(item => ({
    ...item,
    hash: crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex'),
    processed: Date.now()
  }));

  res.json({
    processed: processed.length,
    memory: process.memoryUsage()
  });
});

// Error handling
app.post('/api/error', (req, res) => {
  const { type, trigger } = req.body;

  if (trigger) {
    return res.status(400).json({ error: 'Simulated error', type });
  }

  res.json({ handled: true, type });
});

// Realistic scenarios
app.get('/api/gateway', (req, res) => {
  const { service } = req.query;
  res.json({
    service,
    status: 'healthy',
    latency: Math.random() * 100,
    timestamp: Date.now()
  });
});

app.get('/api/products', (req, res) => {
  res.json({ data: testData.products.slice(0, 50) });
});

app.get('/api/stats', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: Date.now()
  });
});

app.listen(${port}, () => {
  console.log('NexureJS server running on port ${port}');
});
`;

  return { code: serverCode, filename: `nexure-${port}.js` };
}

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
  res.setHeader('X-Timestamp', Date.now());
  next();
});

// Copy all the same routes as NexureJS
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello World', timestamp: Date.now() });
});

// ... (include all other routes with Express syntax)

app.listen(${port}, () => {
  console.log('Express server running on port ${port}');
});
`;

  return { code: serverCode, filename: `express-${port}.js` };
}

async function createFastifyServer(port) {
  const testData = generateTestData();

  const serverCode = `
const fastify = require('fastify')({ logger: false });
const crypto = require('crypto');

const testData = ${JSON.stringify(testData)};

fastify.addHook('onRequest', async (request, reply) => {
  reply.header('X-Framework', 'Fastify');
  reply.header('X-Timestamp', Date.now());
});

// Copy all routes with Fastify syntax
fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello World', timestamp: Date.now() };
});

// ... (include all other routes)

fastify.listen({ port: ${port} }, (err) => {
  if (err) throw err;
  console.log('Fastify server running on port ${port}');
});
`;

  return { code: serverCode, filename: `fastify-${port}.js` };
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

app.use(bodyParser({ jsonLimit: '10mb' }));

app.use(async (ctx, next) => {
  ctx.set('X-Framework', 'Koa');
  ctx.set('X-Timestamp', Date.now());
  await next();
});

// Copy all routes with Koa syntax
router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello World', timestamp: Date.now() };
});

// ... (include all other routes)

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(${port}, () => {
  console.log('Koa server running on port ${port}');
});
`;

  return { code: serverCode, filename: `koa-${port}.js` };
}

// Server management
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
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Server ${framework} exited with code ${code}`));
      }
    });
  });
}

// Statistics calculation
function calculateStats(results) {
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
      p90: responseTimes[Math.floor(responseTimes.length * 0.9)],
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

// Benchmark execution
async function benchmarkScenario(framework, scenario, baseUrl, concurrency) {
  const scenarioConfig = scenarios[scenario];

  const testFunction = () => {
    const path = typeof scenarioConfig.path === 'function' ?
      scenarioConfig.path() : scenarioConfig.path;
    const query = scenarioConfig.query ? scenarioConfig.query() : '';
    const url = `${baseUrl}${path}${query}`;

    const options = {
      method: scenarioConfig.method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };

    if (scenarioConfig.body) {
      options.body = typeof scenarioConfig.body === 'function' ?
        scenarioConfig.body() : scenarioConfig.body;
    }

    return makeRequest(url, options);
  };

  // Warmup
  await runLoadTest(testFunction, Math.min(concurrency, 10), CONFIG.warmupRequests);

  // Actual test
  const testResults = await runLoadTest(testFunction, concurrency, CONFIG.testRequests);

  return calculateStats(testResults);
}

// Main execution
async function runEnhancedComparison() {
  log('🚀 Starting Enhanced Framework Comparison');
  log(`Frameworks: ${CONFIG.frameworks.join(', ')}`);

  const servers = {};
  const serverPaths = [];
  const memoryMonitors = {};

  try {
    // Start servers
    let port = 3001;
    for (const framework of CONFIG.frameworks) {
      log(`Starting ${framework} server...`);

      const server = await startServer(framework, port);
      servers[framework] = {
        ...server,
        port: port,
        baseUrl: `http://localhost:${port}`
      };
      serverPaths.push(server.path);

      // Start memory monitoring
      memoryMonitors[framework] = new MemoryMonitor(server.pid);
      memoryMonitors[framework].start();

      port++;
    }

    // Wait for servers to stabilize
    await new Promise(resolve => setTimeout(resolve, CONFIG.serverStartDelay));

    // Run benchmarks
    for (const framework of CONFIG.frameworks) {
      log(`\n📊 Testing ${framework.toUpperCase()}`);
      results.detailed[framework] = {};

      const baseUrl = servers[framework].baseUrl;

      for (const [scenarioName, scenarioConfig] of Object.entries(scenarios)) {
        log(`  Testing ${scenarioConfig.name}...`);
        results.detailed[framework][scenarioName] = {};

        for (const concurrency of CONFIG.concurrency) {
          try {
            const stats = await benchmarkScenario(framework, scenarioName, baseUrl, concurrency);
            results.detailed[framework][scenarioName][concurrency] = stats;

            log(`    ${concurrency} concurrent: ${stats.throughput.toFixed(0)} req/s, ${stats.latency.avg.toFixed(2)}ms avg`);

          } catch (error) {
            log(`    Error at ${concurrency} concurrent: ${error.message}`);
            results.detailed[framework][scenarioName][concurrency] = { error: error.message };
          }

          // Brief pause between concurrency levels
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Stop memory monitoring
    for (const [framework, monitor] of Object.entries(memoryMonitors)) {
      results.memory[framework] = monitor.stop();
    }

    // Generate analysis
    generateAnalysis();

    // Save and display results
    const resultsFile = await saveResults();
    displayResults();

    log(`\n✅ Enhanced comparison completed! Results saved to: ${resultsFile}`);

  } catch (error) {
    log(`❌ Comparison failed: ${error.message}`);
    console.error(error);

  } finally {
    // Cleanup
    for (const [framework, server] of Object.entries(servers)) {
      if (server.process) {
        server.process.kill('SIGTERM');
        log(`Stopped ${framework} server`);
      }
    }

    for (const [framework, monitor] of Object.entries(memoryMonitors)) {
      monitor.stop();
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

// Analysis generation
function generateAnalysis() {
  const frameworks = CONFIG.frameworks;
  const maxConcurrency = Math.max(...CONFIG.concurrency);

  // Overall rankings
  results.analysis.overall = frameworks.map(framework => {
    let totalScore = 0;
    let validTests = 0;

    for (const [scenarioName, scenarioConfig] of Object.entries(scenarios)) {
      const result = results.detailed[framework]?.[scenarioName]?.[maxConcurrency];
      if (result && !result.error && result.throughput > 0) {
        // Combined score: throughput/latency ratio
        const score = result.throughput / (result.latency.avg + 1);
        totalScore += score;
        validTests++;
      }
    }

    return {
      framework,
      score: validTests > 0 ? totalScore / validTests : 0,
      validTests,
      totalTests: Object.keys(scenarios).length
    };
  }).sort((a, b) => b.score - a.score);

  // Category analysis
  results.analysis.byCategory = {};
  const categories = [...new Set(Object.values(scenarios).map(s => s.category))];

  for (const category of categories) {
    const categoryScenarios = Object.entries(scenarios).filter(([_, s]) => s.category === category);

    results.analysis.byCategory[category] = frameworks.map(framework => {
      let totalScore = 0;
      let validTests = 0;

      for (const [scenarioName] of categoryScenarios) {
        const result = results.detailed[framework]?.[scenarioName]?.[maxConcurrency];
        if (result && !result.error && result.throughput > 0) {
          const score = result.throughput / (result.latency.avg + 1);
          totalScore += score;
          validTests++;
        }
      }

      return {
        framework,
        score: validTests > 0 ? totalScore / validTests : 0,
        validTests
      };
    }).sort((a, b) => b.score - a.score);
  }

  // Scalability analysis
  results.analysis.scalability = {};

  for (const framework of frameworks) {
    results.analysis.scalability[framework] = {};

    for (const [scenarioName] of Object.entries(scenarios)) {
      const scalabilityData = CONFIG.concurrency.map(concurrency => {
        const result = results.detailed[framework]?.[scenarioName]?.[concurrency];
        return {
          concurrency,
          throughput: result?.throughput || 0,
          latency: result?.latency?.avg || 0,
          successRate: result?.successRate || 0
        };
      });

      results.analysis.scalability[framework][scenarioName] = scalabilityData;
    }
  }
}

// Results display
function displayResults() {
  console.log('\n' + '='.repeat(80));
  console.log('🏆 ENHANCED FRAMEWORK COMPARISON RESULTS');
  console.log('='.repeat(80));

  // Overall rankings
  console.log('\n🥇 OVERALL RANKINGS:');
  results.analysis.overall.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    console.log(`${medal} ${result.framework.toUpperCase()} - Score: ${result.score.toFixed(2)} (${result.validTests}/${result.totalTests} tests)`);
  });

  // Category winners
  console.log('\n📊 CATEGORY WINNERS:');
  Object.entries(results.analysis.byCategory).forEach(([category, rankings]) => {
    const winner = rankings[0];
    console.log(`   ${category.toUpperCase()}: ${winner.framework.toUpperCase()} (${winner.score.toFixed(2)})`);
  });

  // Memory usage
  console.log('\n💾 MEMORY USAGE:');
  Object.entries(results.memory).forEach(([framework, stats]) => {
    if (stats) {
      console.log(`   ${framework}: ${(stats.memory.avg / 1024 / 1024).toFixed(1)}MB avg, ${(stats.memory.max / 1024 / 1024).toFixed(1)}MB peak`);
    }
  });

  console.log('\n' + '='.repeat(80));
}

// Results saving
async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `enhanced-framework-comparison-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(results, null, 2));

  return filepath;
}

// Export for use in other scripts
module.exports = { runEnhancedComparison, CONFIG, scenarios };

// Run if executed directly
if (require.main === module) {
  runEnhancedComparison().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
