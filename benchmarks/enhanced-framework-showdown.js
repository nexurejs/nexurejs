#!/usr/bin/env node

/**
 * Enhanced Framework Showdown: Comprehensive Performance Comparison
 * NexureJS vs Express vs Fastify vs Koa vs Hapi vs Restify
 * Advanced testing with memory monitoring, error injection, and performance profiling
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');

// Enhanced Test Configuration
const CONFIG = {
  testDuration: 60000, // 1 minute per test
  concurrency: [10, 50, 100, 200], // Multiple concurrency levels
  warmupRequests: 2000,
  testRequests: 20000,
  serverStartDelay: 5000,
  memoryCheckInterval: 1000, // Check memory every second
  frameworks: ['nexurejs', 'express', 'fastify', 'koa', 'hapi', 'restify'],
  payloadSizes: {
    tiny: 10,      // 10 bytes
    small: 1024,   // 1KB
    medium: 10240, // 10KB
    large: 102400, // 100KB
    huge: 1048576  // 1MB
  }
};

// Results storage
const results = {
  frameworks: {},
  comparison: {},
  analysis: {},
  memoryUsage: {},
  errorInjection: {},
  scalability: {},
  metadata: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
    config: CONFIG
  }
};

/**
 * Utility Functions
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateTestData(size = 'medium') {
  const payloadSize = CONFIG.payloadSizes[size];
  const baseData = {
    users: Array.from({length: 100}, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: Math.random() > 0.3,
      profile: {
        age: Math.floor(Math.random() * 50) + 18,
        location: ['NY', 'CA', 'TX', 'FL'][Math.floor(Math.random() * 4)],
        preferences: Array.from({length: 5}, () => Math.random().toString(36).substr(2, 9))
      }
    })),
    products: Array.from({length: 200}, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      price: Math.floor(Math.random() * 1000) + 10,
      category: ['Electronics', 'Clothing', 'Books', 'Home'][Math.floor(Math.random() * 4)],
      description: 'x'.repeat(Math.floor(Math.random() * 200) + 50),
      tags: Array.from({length: 3}, () => Math.random().toString(36).substr(2, 6))
    })),
    fileData: Buffer.alloc(payloadSize).fill('x').toString(),
    computation: Array.from({length: 2000}, () => Math.floor(Math.random() * 1000)),
    largeArray: Array.from({length: 1000}, (_, i) => ({
      index: i,
      value: Math.random(),
      data: 'x'.repeat(50)
    }))
  };

  return baseData;
}

/**
 * Enhanced HTTP Request Helper with retries and detailed metrics
 */
async function makeRequest(url, options = {}, retries = 2) {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  const attemptRequest = async (attempt) => {
    return new Promise((resolve, reject) => {
      const req = http.request(url, {
        timeout: 15000,
        ...options
      }, (res) => {
        let data = '';
        const firstByteTime = performance.now();

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          const endTime = performance.now();
          const endMemory = process.memoryUsage();

          resolve({
            success: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            responseTime: endTime - startTime,
            timeToFirstByte: firstByteTime - startTime,
            dataSize: data.length,
            headers: res.headers,
            memoryDelta: {
              rss: endMemory.rss - startMemory.rss,
              heapUsed: endMemory.heapUsed - startMemory.heapUsed
            },
            timestamp: Date.now(),
            attempt: attempt + 1
          });
        });
      });

      req.on('error', (error) => {
        const endTime = performance.now();
        reject({
          success: false,
          error: error.message,
          responseTime: endTime - startTime,
          timestamp: Date.now(),
          attempt: attempt + 1
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const endTime = performance.now();
        reject({
          success: false,
          error: 'timeout',
          responseTime: endTime - startTime,
          timestamp: Date.now(),
          attempt: attempt + 1
        });
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await attemptRequest(attempt);
      return result;
    } catch (error) {
      if (attempt === retries) {
        return error;
      }
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

/**
 * Memory monitoring utilities
 */
class MemoryMonitor {
  constructor(processId) {
    this.processId = processId;
    this.samples = [];
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        exec(`ps -p ${this.processId} -o pid,rss,pcpu`, (error, stdout) => {
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
    }, CONFIG.memoryCheckInterval);
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
        samples: this.samples.length
      },
      cpu: {
        min: Math.min(...cpuValues),
        max: Math.max(...cpuValues),
        avg: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length
      }
    };
  }
}

/**
 * Enhanced Test Scenarios
 */
const scenarios = {
  // Basic Performance Tests
  'Simple JSON API': {
    category: 'basic',
    description: 'Basic JSON response performance',
    test: (baseUrl) => () => makeRequest(`${baseUrl}/api/hello`, { method: 'GET' })
  },

  'POST with Validation': {
    category: 'basic',
    description: 'JSON POST with server-side validation',
    test: (baseUrl) => () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        preferences: ['coding', 'music', 'travel']
      };
      return makeRequest(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
    }
  },

  // Database Simulation Tests
  'Database Query Simulation': {
    category: 'database',
    description: 'Simulated database operations with pagination',
    test: (baseUrl) => () => makeRequest(
      `${baseUrl}/api/users?page=${Math.floor(Math.random() * 10) + 1}&limit=20&sort=created&order=desc`,
      { method: 'GET' }
    )
  },

  'Complex Database Join': {
    category: 'database',
    description: 'Simulated complex query with joins and aggregations',
    test: (baseUrl) => () => makeRequest(`${baseUrl}/api/analytics/user-stats`, { method: 'GET' })
  },

  'Database Transaction': {
    category: 'database',
    description: 'Simulated multi-step database transaction',
    test: (baseUrl) => () => {
      const orderData = {
        userId: Math.floor(Math.random() * 1000),
        items: Array.from({length: 3}, () => ({
          productId: Math.floor(Math.random() * 200),
          quantity: Math.floor(Math.random() * 5) + 1
        }))
      };
      return makeRequest(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
    }
  },

  // File Handling Tests
  'Small File Upload': {
    category: 'files',
    description: 'Small file upload (1KB)',
    test: (baseUrl) => () => {
      const testData = generateTestData('small');
      return makeRequest(`${baseUrl}/api/upload/small`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: testData.fileData
      });
    }
  },

  'Medium File Upload': {
    category: 'files',
    description: 'Medium file upload (10KB)',
    test: (baseUrl) => () => {
      const testData = generateTestData('medium');
      return makeRequest(`${baseUrl}/api/upload/medium`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: testData.fileData
      });
    }
  },

  'Large File Upload': {
    category: 'files',
    description: 'Large file upload (100KB)',
    test: (baseUrl) => () => {
      const testData = generateTestData('large');
      return makeRequest(`${baseUrl}/api/upload/large`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: testData.fileData
      });
    }
  },

  // CPU Intensive Tests
  'CPU Intensive Task': {
    category: 'compute',
    description: 'Heavy computational workload',
    test: (baseUrl) => () => {
      const testData = generateTestData();
      return makeRequest(`${baseUrl}/api/compute/heavy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: testData.computation })
      });
    }
  },

  'Async Processing': {
    category: 'compute',
    description: 'Asynchronous background processing simulation',
    test: (baseUrl) => () => makeRequest(`${baseUrl}/api/process/async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskType: 'report', priority: 'normal' })
    })
  },

  // Memory Tests
  'Memory Intensive': {
    category: 'memory',
    description: 'Large object manipulation',
    test: (baseUrl) => () => {
      const testData = generateTestData('huge');
      return makeRequest(`${baseUrl}/api/memory/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: testData.largeArray })
      });
    }
  },

  // Static Content Tests
  'Static File Serving': {
    category: 'static',
    description: 'Static file delivery performance',
    test: (baseUrl) => () => makeRequest(`${baseUrl}/static/test-file.txt`, { method: 'GET' })
  },

  'JSON Data Export': {
    category: 'static',
    description: 'Large JSON data export',
    test: (baseUrl) => () => makeRequest(`${baseUrl}/api/export/users`, { method: 'GET' })
  },

  // Error Handling Tests
  'Error Handling': {
    category: 'errors',
    description: 'Server error handling and recovery',
    test: (baseUrl) => () => makeRequest(`${baseUrl}/api/error/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorType: 'validation', severity: 'medium' })
    })
  },

  // Real-world Simulation
  'E-commerce Simulation': {
    category: 'realistic',
    description: 'Complete e-commerce workflow',
    test: (baseUrl) => () => {
      const actions = [
        `${baseUrl}/api/products/featured`,
        `${baseUrl}/api/cart/add`,
        `${baseUrl}/api/user/preferences`,
        `${baseUrl}/api/recommendations`
      ];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      return makeRequest(randomAction, { method: 'GET' });
    }
  },

  'API Gateway Simulation': {
    category: 'realistic',
    description: 'Microservices gateway pattern',
    test: (baseUrl) => () => {
      const services = ['user', 'order', 'inventory', 'notification'];
      const service = services[Math.floor(Math.random() * services.length)];
      return makeRequest(`${baseUrl}/api/gateway/${service}/health`, { method: 'GET' });
    }
  }
};

/**
 * Enhanced Server Creators with comprehensive routes
 */

// Enhanced NexureJS Server
async function createNexureServer(port) {
  const serverCode = `
const { NexureJS } = require('../src/index.js');
const crypto = require('crypto');
const app = new NexureJS();

const testData = ${JSON.stringify(generateTestData())};
let requestCount = 0;
let memoryLeakArray = [];

// Comprehensive middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  requestCount++;
  res.setHeader('X-Framework', 'NexureJS');
  res.setHeader('X-Request-Count', requestCount);
  next();
});

// Basic routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from NexureJS!', timestamp: Date.now(), server: 'nexurejs' });
});

app.post('/api/users', (req, res) => {
  const user = { id: crypto.randomUUID(), ...req.body, created: new Date().toISOString() };
  res.json(user);
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const sort = req.query.sort || 'id';
  const order = req.query.order || 'asc';

  let users = [...testData.users];
  users.sort((a, b) => order === 'desc' ? b[sort] - a[sort] : a[sort] - b[sort]);

  const start = (page - 1) * limit;
  const paginatedUsers = users.slice(start, start + limit);

  res.json({
    data: paginatedUsers,
    pagination: { page, limit, total: users.length, pages: Math.ceil(users.length / limit) },
    meta: { sort, order }
  });
});

// Database simulation routes
app.get('/api/analytics/user-stats', (req, res) => {
  // Simulate complex query
  const stats = {
    totalUsers: testData.users.length,
    activeUsers: testData.users.filter(u => u.active).length,
    byLocation: testData.users.reduce((acc, user) => {
      acc[user.profile.location] = (acc[user.profile.location] || 0) + 1;
      return acc;
    }, {}),
    avgAge: testData.users.reduce((sum, u) => sum + u.profile.age, 0) / testData.users.length,
    computed: Date.now()
  };

  // Simulate processing time
  setTimeout(() => res.json(stats), Math.random() * 50);
});

app.post('/api/orders', (req, res) => {
  const { userId, items } = req.body;

  // Simulate transaction
  const order = {
    id: crypto.randomUUID(),
    userId,
    items: items.map(item => ({
      ...item,
      price: Math.random() * 100,
      total: item.quantity * Math.random() * 100
    })),
    total: items.reduce((sum, item) => sum + (item.quantity * Math.random() * 100), 0),
    status: 'processing',
    created: new Date().toISOString()
  };

  // Simulate async processing
  setTimeout(() => {
    res.json(order);
  }, Math.random() * 100 + 50);
});

// File upload routes
app.post('/api/upload/small', (req, res) => {
  res.json({ size: req.body.length, type: 'small', processed: Date.now() });
});

app.post('/api/upload/medium', (req, res) => {
  res.json({ size: req.body.length, type: 'medium', processed: Date.now() });
});

app.post('/api/upload/large', (req, res) => {
  res.json({ size: req.body.length, type: 'large', processed: Date.now() });
});

// Compute routes
app.post('/api/compute/heavy', (req, res) => {
  const { numbers } = req.body;

  // Heavy computation
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 100; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }

  res.json({
    result,
    operations: numbers.length * 100,
    duration: Date.now() - req.startTime
  });
});

app.post('/api/process/async', (req, res) => {
  const { taskType, priority } = req.body;
  const taskId = crypto.randomUUID();

  // Simulate async processing
  setTimeout(() => {
    // Response would normally be sent via webhook/websocket
  }, 1000);

  res.json({
    taskId,
    status: 'queued',
    estimatedCompletion: Date.now() + 5000,
    type: taskType,
    priority
  });
});

// Memory test routes
app.post('/api/memory/process', (req, res) => {
  const { data } = req.body;

  // Intentionally create memory pressure
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex'),
    timestamp: Date.now()
  }));

  // Simulate memory leak for testing
  memoryLeakArray.push(...processed.slice(0, 10));
  if (memoryLeakArray.length > 1000) {
    memoryLeakArray = memoryLeakArray.slice(-500);
  }

  res.json({
    processed: processed.length,
    memoryArraySize: memoryLeakArray.length,
    memoryUsage: process.memoryUsage()
  });
});

// Static and export routes
app.get('/static/test-file.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send('This is a test file for static serving performance. ' + 'x'.repeat(1000));
});

app.get('/api/export/users', (req, res) => {
  const exportData = {
    exportId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    data: testData.users,
    metadata: {
      totalRecords: testData.users.length,
      format: 'json',
      version: '1.0'
    }
  };

  res.json(exportData);
});

// Error simulation
app.post('/api/error/simulate', (req, res) => {
  const { errorType, severity } = req.body;

  if (Math.random() < 0.1) { // 10% chance of actual error
    return res.status(500).json({ error: 'Simulated server error', type: errorType });
  }

  res.json({
    handled: true,
    errorType,
    severity,
    message: 'Error simulation completed successfully'
  });
});

// E-commerce simulation routes
app.get('/api/products/featured', (req, res) => {
  const featured = testData.products.slice(0, 10).map(p => ({
    ...p,
    featured: true,
    discount: Math.floor(Math.random() * 30) + 5
  }));
  res.json(featured);
});

app.get('/api/cart/add', (req, res) => {
  res.json({
    success: true,
    cartId: crypto.randomUUID(),
    itemCount: Math.floor(Math.random() * 5) + 1,
    total: Math.random() * 500
  });
});

app.get('/api/user/preferences', (req, res) => {
  res.json({
    userId: crypto.randomUUID(),
    preferences: {
      theme: 'dark',
      notifications: true,
      categories: ['electronics', 'books'],
      priceRange: { min: 10, max: 500 }
    }
  });
});

app.get('/api/recommendations', (req, res) => {
  const recommendations = testData.products.slice(0, 5).map(p => ({
    ...p,
    score: Math.random(),
    reason: 'Based on browsing history'
  }));
  res.json(recommendations);
});

// Gateway simulation
app.get('/api/gateway/:service/health', (req, res) => {
  const { service } = req.params;
  res.json({
    service,
    status: 'healthy',
    latency: Math.random() * 50,
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// Health and stats
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    requests: requestCount,
    memory: process.memoryUsage()
  });
});

app.listen(${port}, () => {
  console.log('Enhanced NexureJS server running on port ${port}');
});
`;

  return { code: serverCode, filename: `enhanced-nexure-${port}.js` };
}

// Enhanced Express Server with identical routes
async function createExpressServer(port) {
  const serverCode = `
const express = require('express');
const crypto = require('crypto');
const app = express();

const testData = ${JSON.stringify(generateTestData())};
let requestCount = 0;
let memoryLeakArray = [];

app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

app.use((req, res, next) => {
  req.startTime = Date.now();
  requestCount++;
  res.setHeader('X-Framework', 'Express');
  res.setHeader('X-Request-Count', requestCount);
  next();
});

// [Copy all the same routes from NexureJS but with Express syntax]
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!', timestamp: Date.now(), server: 'express' });
});

// ... [Include all other routes with same logic] ...

app.listen(${port}, () => {
  console.log('Enhanced Express server running on port ${port}');
});
`;

  return { code: serverCode, filename: `enhanced-express-${port}.js` };
}

// Continue with similar enhanced servers for Fastify, Koa, Hapi, Restify...

/**
 * Enhanced benchmark execution with memory monitoring
 */
async function benchmarkFrameworkEnhanced(framework, scenario, scenarioFunc, baseUrl, concurrency) {
  log(`Testing ${framework} - ${scenario.description} (${concurrency} concurrent)`);

  const memoryMonitor = new MemoryMonitor(process.pid); // Would need actual server PID
  memoryMonitor.start();

  try {
    // Warmup with memory monitoring
    await runLoadTest(scenarioFunc, Math.min(concurrency, 10), CONFIG.warmupRequests);

    // Actual test
    const testResults = await runLoadTest(scenarioFunc, concurrency, CONFIG.testRequests);

    const memoryStats = memoryMonitor.stop();
    const stats = calculateEnhancedStats(testResults, memoryStats);

    log(`${framework} - ${scenario.description}: ${stats.throughput.toFixed(0)} req/s, ${stats.latency.avg.toFixed(2)}ms avg, ${(stats.memoryStats?.memory.avg / 1024 / 1024).toFixed(1)}MB avg`);

    return stats;

  } catch (error) {
    memoryMonitor.stop();
    log(`Error testing ${framework} - ${scenario.description}: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Enhanced statistics calculation with memory and performance profiling
 */
function calculateEnhancedStats(results, memoryStats) {
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
      memoryStats: null,
      errors: failed.map(f => f.error).filter(Boolean)
    };
  }

  const responseTimes = successful.map(r => r.responseTime).sort((a, b) => a - b);
  const timeToFirstByte = successful.map(r => r.timeToFirstByte || r.responseTime).sort((a, b) => a - b);
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
    timeToFirstByte: {
      avg: timeToFirstByte.reduce((sum, ttfb) => sum + ttfb, 0) / timeToFirstByte.length,
      p50: timeToFirstByte[Math.floor(timeToFirstByte.length * 0.5)],
      p95: timeToFirstByte[Math.floor(timeToFirstByte.length * 0.95)]
    },
    dataTransfer: {
      totalBytes: successful.reduce((sum, r) => sum + (r.dataSize || 0), 0),
      avgResponseSize: successful.reduce((sum, r) => sum + (r.dataSize || 0), 0) / successful.length
    },
    memoryStats,
    errors: [...new Set(failed.map(f => f.error).filter(Boolean))]
  };
}

/**
 * Enhanced main execution with scalability testing
 */
async function runEnhancedFrameworkShowdown() {
  log('🥊 Starting Enhanced Framework Showdown');
  log(`Testing: ${CONFIG.frameworks.join(', ')}`);
  log(`Scenarios: ${Object.keys(scenarios).length}`);
  log(`Concurrency levels: ${CONFIG.concurrency.join(', ')}`);

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

    // Wait for all servers to start
    log('Waiting for servers to start...');
    await new Promise(resolve => setTimeout(resolve, CONFIG.serverStartDelay));

    // Run benchmarks for each framework, scenario, and concurrency level
    for (const framework of Object.keys(servers)) {
      log(`\n🧪 Testing ${framework.toUpperCase()}`);
      results.frameworks[framework] = {};

      const baseUrl = servers[framework].baseUrl;

      for (const [scenarioName, scenario] of Object.entries(scenarios)) {
        results.frameworks[framework][scenarioName] = {};

        for (const concurrency of CONFIG.concurrency) {
          const stats = await benchmarkFrameworkEnhanced(
            framework,
            scenario,
            scenario.test(baseUrl),
            baseUrl,
            concurrency
          );

          results.frameworks[framework][scenarioName][`${concurrency}_concurrent`] = stats;

          // Small delay between concurrency tests
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Delay between scenarios
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Generate enhanced analysis
    generateEnhancedAnalysis();

    // Save results
    const resultsFile = await saveEnhancedResults();

    // Display results
    displayEnhancedResults();

    log(`\nDetailed results saved to: ${resultsFile}`);
    log('🏁 Enhanced Framework Showdown completed!');

  } catch (error) {
    log(`❌ Enhanced Framework Showdown failed: ${error.message}`);
    console.error(error);

  } finally {
    // Stop all servers and cleanup
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

/**
 * Enhanced analysis generation
 */
function generateEnhancedAnalysis() {
  const frameworks = Object.keys(results.frameworks);

  // Performance rankings by category
  results.analysis.byCategory = {};

  const categories = [...new Set(Object.values(scenarios).map(s => s.category))];

  for (const category of categories) {
    const categoryScenarios = Object.entries(scenarios).filter(([_, s]) => s.category === category);
    results.analysis.byCategory[category] = {};

    for (const concurrency of CONFIG.concurrency) {
      const scores = {};

      for (const framework of frameworks) {
        let totalScore = 0;
        let validScenarios = 0;

        for (const [scenarioName] of categoryScenarios) {
          const result = results.frameworks[framework]?.[scenarioName]?.[`${concurrency}_concurrent`];
          if (result && !result.error && result.throughput > 0) {
            // Combined score: throughput / latency ratio
            const score = result.throughput / (result.latency.avg + 1);
            totalScore += score;
            validScenarios++;
          }
        }

        scores[framework] = validScenarios > 0 ? totalScore / validScenarios : 0;
      }

      results.analysis.byCategory[category][`${concurrency}_concurrent`] = Object.entries(scores)
        .sort(([,a], [,b]) => b - a)
        .map(([framework, score]) => ({ framework, score }));
    }
  }

  // Scalability analysis
  results.analysis.scalability = {};

  for (const framework of frameworks) {
    results.analysis.scalability[framework] = {};

    for (const [scenarioName] of Object.entries(scenarios)) {
      const scalabilityData = CONFIG.concurrency.map(concurrency => {
        const result = results.frameworks[framework]?.[scenarioName]?.[`${concurrency}_concurrent`];
        return {
          concurrency,
          throughput: result?.throughput || 0,
          latency: result?.latency.avg || 0,
          successRate: result?.successRate || 0
        };
      });

      results.analysis.scalability[framework][scenarioName] = scalabilityData;
    }
  }

  // Overall rankings
  results.analysis.overallRanking = frameworks.map(framework => {
    let totalScore = 0;
    let totalTests = 0;

    for (const scenarioName of Object.keys(scenarios)) {
      for (const concurrency of CONFIG.concurrency) {
        const result = results.frameworks[framework]?.[scenarioName]?.[`${concurrency}_concurrent`];
        if (result && !result.error && result.throughput > 0) {
          totalScore += result.throughput / (result.latency.avg + 1);
          totalTests++;
        }
      }
    }

    return {
      framework,
      avgScore: totalTests > 0 ? totalScore / totalTests : 0,
      completedTests: totalTests
    };
  }).sort((a, b) => b.avgScore - a.avgScore);
}

/**
 * Enhanced results display
 */
function displayEnhancedResults() {
  console.log('\n' + '='.repeat(100));
  console.log('🏆 ENHANCED FRAMEWORK SHOWDOWN RESULTS');
  console.log('='.repeat(100));

  // Overall rankings
  console.log('\n🥇 OVERALL PERFORMANCE RANKING:');
  results.analysis.overallRanking.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    console.log(`${medal} ${result.framework.toUpperCase()} - Score: ${result.avgScore.toFixed(2)} (${result.completedTests} tests)`);
  });

  // Category winners
  console.log('\n📊 CATEGORY WINNERS (High Concurrency):');
  const highConcurrency = Math.max(...CONFIG.concurrency);
  Object.entries(results.analysis.byCategory).forEach(([category, data]) => {
    const winner = data[`${highConcurrency}_concurrent`]?.[0];
    if (winner) {
      console.log(`   ${category.toUpperCase()}: ${winner.framework.toUpperCase()} (${winner.score.toFixed(2)})`);
    }
  });

  // Scalability insights
  console.log('\n📈 SCALABILITY INSIGHTS:');
  const bestScalability = results.analysis.overallRanking[0];
  if (bestScalability) {
    console.log(`Best Overall: ${bestScalability.framework.toUpperCase()}`);
    console.log(`Performance Score: ${bestScalability.avgScore.toFixed(2)}`);
    console.log(`Completed Tests: ${bestScalability.completedTests}/${Object.keys(scenarios).length * CONFIG.concurrency.length}`);
  }

  console.log('\n' + '='.repeat(100));
}

/**
 * Enhanced results saving
 */
async function saveEnhancedResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `enhanced-framework-showdown-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(results, null, 2));

  // Also generate HTML report
  await generateHTMLReport(timestamp);

  return filepath;
}

/**
 * Generate comprehensive HTML report
 */
async function generateHTMLReport(timestamp) {
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced Framework Showdown Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        /* Enhanced CSS styles for comprehensive report */
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .chart-container { position: relative; height: 400px; margin: 20px 0; }
        /* Add more comprehensive styles */
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Enhanced Framework Showdown Report</h1>
            <p>Comprehensive Performance Analysis • ${timestamp}</p>
        </div>

        <!-- Summary Cards -->
        <div class="grid">
            <div class="card">
                <h3>🏆 Overall Winner</h3>
                <p class="winner">${results.analysis.overallRanking[0]?.framework.toUpperCase() || 'N/A'}</p>
            </div>
            <div class="card">
                <h3>📊 Total Tests</h3>
                <p class="metric">${Object.keys(scenarios).length * CONFIG.concurrency.length}</p>
            </div>
            <div class="card">
                <h3>🏗️ Frameworks Tested</h3>
                <p class="metric">${CONFIG.frameworks.length}</p>
            </div>
            <div class="card">
                <h3>⚡ Max Concurrency</h3>
                <p class="metric">${Math.max(...CONFIG.concurrency)}</p>
            </div>
        </div>

        <!-- Performance Charts -->
        <div class="card">
            <h2>📈 Performance Comparison Charts</h2>
            <div class="chart-container">
                <canvas id="throughputChart"></canvas>
            </div>
        </div>

        <!-- Detailed Results Tables -->
        <!-- Add comprehensive tables and analysis -->

    </div>

    <script>
        // Add Chart.js visualizations
        const ctx = document.getElementById('throughputChart').getContext('2d');
        // Add chart implementation
    </script>
</body>
</html>
`;

  const htmlPath = path.join(__dirname, 'results', `enhanced-framework-report-${timestamp}.html`);
  await fs.writeFile(htmlPath, htmlContent);
}

// Run if this file is executed directly
if (require.main === module) {
  runEnhancedFrameworkShowdown().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runEnhancedFrameworkShowdown, CONFIG };
