#!/usr/bin/env node

/**
 * Framework Showdown: NexureJS vs Express vs Fastify vs Koa
 * Comprehensive performance comparison with real-world scenarios
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test Configuration
const CONFIG = {
  testDuration: 30000, // 30 seconds per test
  concurrency: 100,
  warmupRequests: 1000,
  testRequests: 10000,
  serverStartDelay: 3000,
  frameworks: ['nexurejs', 'express', 'fastify', 'koa']
};

// Results storage
const results = {
  frameworks: {},
  comparison: {},
  winner: {},
  metadata: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: require('os').cpus().length,
    memory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB',
    config: CONFIG
  }
};

/**
 * Utility Functions
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateTestData() {
  return {
    users: Array.from({length: 50}, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: Math.random() > 0.3
    })),
    products: Array.from({length: 100}, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      price: Math.floor(Math.random() * 1000) + 10,
      category: ['Electronics', 'Clothing', 'Books', 'Home'][Math.floor(Math.random() * 4)]
    })),
    fileData: Buffer.alloc(1024 * 5).fill('x').toString(), // 5KB file
    computation: Array.from({length: 1000}, () => Math.floor(Math.random() * 1000))
  };
}

/**
 * HTTP Request Helper
 */
async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const req = http.request(url, {
      timeout: 10000,
      ...options
    }, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          responseTime: endTime - startTime,
          dataSize: data.length,
          timestamp: Date.now()
        });
      });
    });

    req.on('error', (error) => {
      const endTime = performance.now();
      resolve({
        success: false,
        error: error.message,
        responseTime: endTime - startTime,
        timestamp: Date.now()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const endTime = performance.now();
      resolve({
        success: false,
        error: 'timeout',
        responseTime: endTime - startTime,
        timestamp: Date.now()
      });
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Run load test with concurrency
 */
async function runLoadTest(testFunction, concurrency, totalRequests) {
  const results = [];
  const batchSize = concurrency;
  const batches = Math.ceil(totalRequests / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const currentBatchSize = Math.min(batchSize, totalRequests - (batch * batchSize));
    const promises = [];

    for (let i = 0; i < currentBatchSize; i++) {
      promises.push(testFunction().catch(error => ({
        success: false,
        error: error.message,
        responseTime: 0,
        timestamp: Date.now()
      })));
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Small delay between batches
    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return results;
}

/**
 * Enhanced Test Scenarios - Expanding the existing scenarios
 */
const enhancedScenarios = {
  // Keep existing scenarios
  ...scenarios,

  // New comprehensive scenarios
  'Large JSON Response': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/export/large`, { method: 'GET' }),

  'Streaming Data': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/stream/data`, { method: 'GET' }),

  'Database Transaction': (baseUrl) => () => {
    const transactionData = {
      operations: [
        { type: 'insert', table: 'users', data: { name: 'John', email: 'john@test.com' } },
        { type: 'update', table: 'profiles', data: { userId: 1, bio: 'Updated bio' } },
        { type: 'delete', table: 'logs', where: { expired: true } }
      ]
    };
    return makeRequest(`${baseUrl}/api/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionData)
    });
  },

  'Memory Stress Test': (baseUrl) => () => {
    const largeData = {
      data: Array.from({length: 10000}, (_, i) => ({
        id: i,
        content: 'x'.repeat(1000),
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
    const shouldError = Math.random() < 0.1; // 10% error rate
    return makeRequest(`${baseUrl}/api/error/test?shouldError=${shouldError}`, {
      method: 'GET'
    });
  },

  'WebSocket Simulation': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/websocket/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connections: 100, messagesPerConnection: 10 })
    }),

  'Static File Serving': (baseUrl) => () =>
    makeRequest(`${baseUrl}/static/large-file.json`, { method: 'GET' }),

  'Middleware Chain Test': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/middleware/chain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'test-value',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({ test: 'middleware performance' })
    }),

  'Concurrent Database Operations': (baseUrl) => () => {
    const operations = ['read', 'write', 'update', 'delete'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    return makeRequest(`${baseUrl}/api/db/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'test_table',
        data: { id: Math.floor(Math.random() * 1000) }
      })
    });
  },

  'Real-time Analytics': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/analytics/realtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics: ['cpu', 'memory', 'requests', 'errors'],
        timeRange: '1h',
        granularity: '1m'
      })
    })
};

// Replace the original scenarios with enhanced ones
Object.assign(scenarios, enhancedScenarios);

/**
 * Framework Server Creators
 */

// NexureJS Server
async function createNexureServer(port) {
  const serverCode = `
import { NexureJS } from '../src/index.js';
import crypto from 'crypto';
const app = new NexureJS();

const testData = ${JSON.stringify(generateTestData())};

// Middleware
app.use((req, res, next) => {
  res.setHeader('X-Framework', 'NexureJS');
  next();
});

// Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from NexureJS!', timestamp: Date.now() });
});

app.post('/api/users', (req, res) => {
  const user = { id: Date.now(), ...req.body, created: new Date().toISOString() };
  res.json(user);
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.json({ data: users, page, limit, total: testData.users.length });
});

app.get('/api/products', (req, res) => {
  res.json({ data: testData.products, total: testData.products.length });
});

app.post('/api/upload', (req, res) => {
  res.json({ size: req.body.length, uploaded: Date.now() });
});

app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;
  let sum = 0;
  for (const num of numbers) {
    sum += Math.sqrt(num * num + 1);
  }
  res.json({ result: sum, count: numbers.length });
});

app.get('/api/stats', (req, res) => {
  res.json({
    users: testData.users.length,
    products: testData.products.length,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Enhanced test routes
app.get('/api/export/large', (req, res) => {
  const largeData = {
    users: testData.users,
    products: testData.products,
    metadata: {
      exported: Date.now(),
      size: 'large',
      compression: false
    },
    additionalData: Array.from({length: 1000}, (_, i) => ({
      id: i,
      data: 'x'.repeat(500)
    }))
  };
  res.json(largeData);
});

app.get('/api/stream/data', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.write('[');

  for (let i = 0; i < 1000; i++) {
    const data = { id: i, value: Math.random(), timestamp: Date.now() };
    res.write(JSON.stringify(data));
    if (i < 999) res.write(',');
  }

  res.write(']');
  res.end();
});

app.post('/api/transaction', (req, res) => {
  const { operations } = req.body;
  const results = operations.map(op => ({
    ...op,
    success: Math.random() > 0.05, // 95% success rate
    duration: Math.random() * 50,
    timestamp: Date.now()
  }));

  res.json({
    transactionId: Date.now(),
    operations: results,
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
  });
});

app.post('/api/memory/stress', (req, res) => {
  const { data } = req.body;

  // Memory intensive processing
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));

  res.json({
    processed: processed.length,
    memoryUsage: process.memoryUsage()
  });
});

app.get('/api/error/test', (req, res) => {
  if (req.query.shouldError === 'true') {
    return res.status(500).json({ error: 'Simulated error', code: 'TEST_ERROR' });
  }
  res.json({ success: true, message: 'No error triggered' });
});

app.post('/api/websocket/simulate', (req, res) => {
  const { connections, messagesPerConnection } = req.body;

  // Simulate WebSocket load
  const stats = {
    connections: connections,
    messages: connections * messagesPerConnection,
    avgLatency: Math.random() * 50,
    successRate: 95 + Math.random() * 5
  };

  res.json(stats);
});

app.get('/static/large-file.json', (req, res) => {
  const largeFile = {
    data: Array.from({length: 5000}, (_, i) => ({
      id: i,
      content: 'Static file content ' + 'x'.repeat(200)
    })),
    metadata: { size: 'large', type: 'static' }
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(largeFile);
});

app.post('/api/middleware/chain', (req, res) => {
  // Simulate middleware processing
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 },
    { name: 'rateLimit', duration: Math.random() * 1 }
  ];

  res.json({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: req.body
  });
});

app.post('/api/db/:operation', (req, res) => {
  const { operation } = req.params;
  const { table, data } = req.body;

  // Simulate database operation
  const operationTime = Math.random() * 100;

  res.json({
    operation,
    table,
    success: Math.random() > 0.02, // 98% success rate
    duration: operationTime,
    affectedRows: Math.floor(Math.random() * 10) + 1
  });
});

app.post('/api/analytics/realtime', (req, res) => {
  const { metrics, timeRange, granularity } = req.body;

  const analyticsData = metrics.map(metric => ({
    metric,
    values: Array.from({length: 60}, (_, i) => ({
      timestamp: Date.now() - (i * 60000),
      value: Math.random() * 100
    }))
  }));

  res.json({
    timeRange,
    granularity,
    data: analyticsData,
    generated: Date.now()
  });
});

app.listen(${port}, () => {
  console.log('NexureJS server running on port ${port}');
});
`;

  return { code: serverCode, filename: `nexure-${port}.js` };
}

// Express Server
async function createExpressServer(port) {
  const serverCode = `
import express from 'express';
import crypto from 'crypto';
const app = express();

const testData = ${JSON.stringify(generateTestData())};

app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Framework', 'Express');
  next();
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!', timestamp: Date.now() });
});

app.post('/api/users', (req, res) => {
  const user = { id: Date.now(), ...req.body, created: new Date().toISOString() };
  res.json(user);
});

app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.json({ data: users, page, limit, total: testData.users.length });
});

app.get('/api/products', (req, res) => {
  res.json({ data: testData.products, total: testData.products.length });
});

app.post('/api/upload', (req, res) => {
  res.json({ size: req.body.length, uploaded: Date.now() });
});

app.post('/api/compute', (req, res) => {
  const { numbers } = req.body;
  let sum = 0;
  for (const num of numbers) {
    sum += Math.sqrt(num * num + 1);
  }
  res.json({ result: sum, count: numbers.length });
});

app.get('/api/stats', (req, res) => {
  res.json({
    users: testData.users.length,
    products: testData.products.length,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Enhanced test routes (same as NexureJS)
app.get('/api/export/large', (req, res) => {
  const largeData = {
    users: testData.users,
    products: testData.products,
    metadata: {
      exported: Date.now(),
      size: 'large',
      compression: false
    },
    additionalData: Array.from({length: 1000}, (_, i) => ({
      id: i,
      data: 'x'.repeat(500)
    }))
  };
  res.json(largeData);
});

app.get('/api/stream/data', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.write('[');

  for (let i = 0; i < 1000; i++) {
    const data = { id: i, value: Math.random(), timestamp: Date.now() };
    res.write(JSON.stringify(data));
    if (i < 999) res.write(',');
  }

  res.write(']');
  res.end();
});

app.post('/api/transaction', (req, res) => {
  const { operations } = req.body;
  const results = operations.map(op => ({
    ...op,
    success: Math.random() > 0.05,
    duration: Math.random() * 50,
    timestamp: Date.now()
  }));

  res.json({
    transactionId: Date.now(),
    operations: results,
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
  });
});

app.post('/api/memory/stress', (req, res) => {
  const { data } = req.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));

  res.json({
    processed: processed.length,
    memoryUsage: process.memoryUsage()
  });
});

app.get('/api/error/test', (req, res) => {
  if (req.query.shouldError === 'true') {
    return res.status(500).json({ error: 'Simulated error', code: 'TEST_ERROR' });
  }
  res.json({ success: true, message: 'No error triggered' });
});

app.post('/api/websocket/simulate', (req, res) => {
  const { connections, messagesPerConnection } = req.body;
  const stats = {
    connections: connections,
    messages: connections * messagesPerConnection,
    avgLatency: Math.random() * 50,
    successRate: 95 + Math.random() * 5
  };
  res.json(stats);
});

app.get('/static/large-file.json', (req, res) => {
  const largeFile = {
    data: Array.from({length: 5000}, (_, i) => ({
      id: i,
      content: 'Static file content ' + 'x'.repeat(200)
    })),
    metadata: { size: 'large', type: 'static' }
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(largeFile);
});

app.post('/api/middleware/chain', (req, res) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 },
    { name: 'rateLimit', duration: Math.random() * 1 }
  ];

  res.json({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: req.body
  });
});

app.post('/api/db/:operation', (req, res) => {
  const { operation } = req.params;
  const { table, data } = req.body;
  const operationTime = Math.random() * 100;

  res.json({
    operation,
    table,
    success: Math.random() > 0.02,
    duration: operationTime,
    affectedRows: Math.floor(Math.random() * 10) + 1
  });
});

app.post('/api/analytics/realtime', (req, res) => {
  const { metrics, timeRange, granularity } = req.body;
  const analyticsData = metrics.map(metric => ({
    metric,
    values: Array.from({length: 60}, (_, i) => ({
      timestamp: Date.now() - (i * 60000),
      value: Math.random() * 100
    }))
  }));

  res.json({
    timeRange,
    granularity,
    data: analyticsData,
    generated: Date.now()
  });
});

app.listen(${port}, () => {
  console.log('Express server running on port ${port}');
});
`;

  return { code: serverCode, filename: `express-${port}.js` };
}

// Fastify Server
async function createFastifyServer(port) {
  const serverCode = `
import Fastify from 'fastify';
const fastify = Fastify({ logger: false });

const testData = ${JSON.stringify(generateTestData())};

fastify.addHook('onRequest', async (request, reply) => {
  reply.header('X-Framework', 'Fastify');
});

fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello from Fastify!', timestamp: Date.now() };
});

fastify.post('/api/users', async (request, reply) => {
  const user = { id: Date.now(), ...request.body, created: new Date().toISOString() };
  return user;
});

fastify.get('/api/users', async (request, reply) => {
  const page = parseInt(request.query.page) || 1;
  const limit = parseInt(request.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  return { data: users, page, limit, total: testData.users.length };
});

fastify.get('/api/products', async (request, reply) => {
  return { data: testData.products, total: testData.products.length };
});

fastify.post('/api/upload', async (request, reply) => {
  return { size: request.body.length, uploaded: Date.now() };
});

fastify.post('/api/compute', async (request, reply) => {
  const { numbers } = request.body;
  let sum = 0;
  for (const num of numbers) {
    sum += Math.sqrt(num * num + 1);
  }
  return { result: sum, count: numbers.length };
});

fastify.get('/api/stats', async (request, reply) => {
  return {
    users: testData.users.length,
    products: testData.products.length,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
});

fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', timestamp: Date.now() };
});

const start = async () => {
  try {
    await fastify.listen({ port: ${port} });
    console.log('Fastify server running on port ${port}');
  } catch (err) {
    process.exit(1);
  }
};
start();
`;

  return { code: serverCode, filename: `fastify-${port}.js` };
}

// Koa Server
async function createKoaServer(port) {
  const serverCode = `
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';

const app = new Koa();
const router = new Router();

const testData = ${JSON.stringify(generateTestData())};

app.use(bodyParser());

app.use(async (ctx, next) => {
  ctx.set('X-Framework', 'Koa');
  await next();
});

router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from Koa!', timestamp: Date.now() };
});

router.post('/api/users', (ctx) => {
  const user = { id: Date.now(), ...ctx.request.body, created: new Date().toISOString() };
  ctx.body = user;
});

router.get('/api/users', (ctx) => {
  const page = parseInt(ctx.query.page) || 1;
  const limit = parseInt(ctx.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  ctx.body = { data: users, page, limit, total: testData.users.length };
});

router.get('/api/products', (ctx) => {
  ctx.body = { data: testData.products, total: testData.products.length };
});

router.post('/api/upload', (ctx) => {
  ctx.body = { size: ctx.request.body.length, uploaded: Date.now() };
});

router.post('/api/compute', (ctx) => {
  const { numbers } = ctx.request.body;
  let sum = 0;
  for (const num of numbers) {
    sum += Math.sqrt(num * num + 1);
  }
  ctx.body = { result: sum, count: numbers.length };
});

router.get('/api/stats', (ctx) => {
  ctx.body = {
    users: testData.users.length,
    products: testData.products.length,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
});

router.get('/api/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: Date.now() };
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(${port}, () => {
  console.log('Koa server running on port ${port}');
});
`;

  return { code: serverCode, filename: `koa-${port}.js` };
}

/**
 * Start server for a specific framework
 */
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

  const process = spawn('node', [serverPath], {
    stdio: 'pipe',
    detached: false
  });

  return { process, path: serverPath };
}

/**
 * Memory Monitor Class
 */
class MemoryMonitor {
  constructor(processId) {
    this.processId = processId;
    this.samples = [];
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      this.collectSample();
    }, 1000);
  }

  collectSample() {
    const usage = process.memoryUsage();
    this.samples.push({
      timestamp: Date.now(),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    });
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

/**
 * Enhanced Statistics Calculation
 */
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

  // Calculate additional metrics
  const dataTransfer = successful.reduce((sum, r) => sum + (r.dataSize || 0), 0);
  const avgResponseSize = dataTransfer / successful.length;

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
      totalBytes: dataTransfer,
      avgResponseSize: avgResponseSize,
      throughputMBps: totalTime > 0 ? (dataTransfer / 1024 / 1024) / (totalTime / 1000) : 0
    },
    errors: [...new Set(failed.map(f => f.error))],
    memoryImpact: successful.reduce((sum, r) => sum + (r.memoryDelta?.heapUsed || 0), 0) / successful.length
  };
}

/**
 * Run benchmark for a specific framework and scenario
 */
async function benchmarkFramework(framework, scenario, scenarioFunc, baseUrl) {
  log(`Testing ${framework} - ${scenario}`);

  const concurrencyLevels = [10, 25, 50, 100, 200];
  const results = {};

  // Start memory monitoring
  const memoryMonitor = new MemoryMonitor();
  memoryMonitor.start();

  try {
    for (const concurrency of concurrencyLevels) {
      log(`  Testing with ${concurrency} concurrent connections...`);

      // Warmup
      await runLoadTest(scenarioFunc, Math.min(concurrency, 10), Math.min(CONFIG.warmupRequests, 500));

      // Actual test
      const testResults = await runLoadTest(
        scenarioFunc,
        concurrency,
        Math.min(CONFIG.testRequests, 2000)
      );

      const stats = calculateEnhancedStats(testResults);
      results[concurrency] = stats;

      log(`    ${concurrency} concurrent: ${stats.throughput.toFixed(0)} req/s, ${stats.latency.avg.toFixed(2)}ms avg, ${stats.successRate.toFixed(1)}% success`);

      // Break early if performance degrades significantly
      if (stats.successRate < 50) {
        log(`    Performance degraded significantly, stopping at ${concurrency} concurrent`);
        break;
      }

      // Brief pause between concurrency levels
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Stop memory monitoring
    const memoryStats = memoryMonitor.stop();

    // Calculate aggregate stats
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

/**
 * Calculate aggregate statistics across all concurrency levels
 */
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
      avg: successRates.reduce((a, b) => a + b, 0) / successRates.length,
      min: Math.min(...successRates)
    },
    scalabilityScore: calculateScalabilityScore(concurrencyResults)
  };
}

/**
 * Calculate scalability score based on performance across concurrency levels
 */
function calculateScalabilityScore(concurrencyResults) {
  const validResults = Object.entries(concurrencyResults)
    .filter(([_, r]) => r && !r.error && r.successRate > 90)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  if (validResults.length < 2) return 0;

  const [firstConcurrency, firstResult] = validResults[0];
  const [lastConcurrency, lastResult] = validResults[validResults.length - 1];

  const concurrencyRatio = parseInt(lastConcurrency) / parseInt(firstConcurrency);
  const throughputRatio = lastResult.throughput / firstResult.throughput;

  // Ideal scalability would be linear (throughputRatio = concurrencyRatio)
  return Math.min(1, throughputRatio / concurrencyRatio);
}

/**
 * Main benchmark execution
 */
async function runFrameworkShowdown() {
  log('🥊 Starting Framework Showdown');
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

    // Wait for all servers to start
    log('Waiting for servers to start...');
    await new Promise(resolve => setTimeout(resolve, CONFIG.serverStartDelay));

    // Run benchmarks for each framework and scenario
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

        // Small delay between scenarios
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Generate comparison and analysis
    generateComparison();

    // Save results
    const resultsFile = await saveResults();

    // Display results
    displayResults();

    log(`\nDetailed results saved to: ${resultsFile}`);
    log('🏁 Framework Showdown completed!');

  } catch (error) {
    log(`❌ Framework Showdown failed: ${error.message}`);
    console.error(error);

  } finally {
    // Stop all servers
    for (const [framework, server] of Object.entries(servers)) {
      if (server.process) {
        server.process.kill('SIGTERM');
        log(`Stopped ${framework} server`);
      }
    }

    // Clean up server files
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
 * Generate comprehensive comparison analysis
 */
function generateComparison() {
  const frameworks = Object.keys(results.frameworks);
  results.comparison = {};
  results.winner = {};
  results.analysis = {};

  // Compare each scenario
  for (const scenario of Object.keys(scenarios)) {
    const scenarioResults = {};
    let bestScore = 0;
    let winner = null;

    for (const framework of frameworks) {
      const result = results.frameworks[framework][scenario];
      if (result && !result.error && result.aggregateStats) {
        scenarioResults[framework] = {
          maxThroughput: result.aggregateStats.throughput.max,
          avgThroughput: result.aggregateStats.throughput.avg,
          minLatency: result.aggregateStats.latency.min,
          avgLatency: result.aggregateStats.latency.avg,
          avgSuccessRate: result.aggregateStats.successRate.avg,
          scalabilityScore: result.aggregateStats.scalabilityScore,
          memoryEfficiency: result.memoryStats ?
            (result.aggregateStats.throughput.max / (result.memoryStats.memory.rss.avg / 1024 / 1024)) : 0
        };

        // Comprehensive scoring: throughput, latency, success rate, scalability
        const score = (
          result.aggregateStats.throughput.max * 0.3 +
          (1000 / result.aggregateStats.latency.avg) * 0.3 +
          result.aggregateStats.successRate.avg * 0.2 +
          result.aggregateStats.scalabilityScore * 100 * 0.2
        );

        if (score > bestScore) {
          bestScore = score;
          winner = framework;
        }
      }
    }

    results.comparison[scenario] = scenarioResults;
    results.winner[scenario] = winner;
  }

  // Overall analysis
  const overallScores = {};
  const categoryScores = {
    throughput: {},
    latency: {},
    scalability: {},
    reliability: {}
  };

  for (const framework of frameworks) {
    let totalScore = 0;
    let validScenarios = 0;
    let throughputSum = 0;
    let latencySum = 0;
    let scalabilitySum = 0;
    let reliabilitySum = 0;

    for (const scenario of Object.keys(scenarios)) {
      const result = results.frameworks[framework][scenario];
      if (result && !result.error && result.aggregateStats) {
        const score = (
          result.aggregateStats.throughput.max * 0.3 +
          (1000 / result.aggregateStats.latency.avg) * 0.3 +
          result.aggregateStats.successRate.avg * 0.2 +
          result.aggregateStats.scalabilityScore * 100 * 0.2
        );

        totalScore += score;
        throughputSum += result.aggregateStats.throughput.max;
        latencySum += result.aggregateStats.latency.avg;
        scalabilitySum += result.aggregateStats.scalabilityScore;
        reliabilitySum += result.aggregateStats.successRate.avg;
        validScenarios++;
      }
    }

    if (validScenarios > 0) {
      overallScores[framework] = totalScore / validScenarios;
      categoryScores.throughput[framework] = throughputSum / validScenarios;
      categoryScores.latency[framework] = latencySum / validScenarios;
      categoryScores.scalability[framework] = scalabilitySum / validScenarios;
      categoryScores.reliability[framework] = reliabilitySum / validScenarios;
    } else {
      overallScores[framework] = 0;
    }
  }

  // Determine winners for each category
  results.winner.overall = Object.keys(overallScores).reduce((a, b) =>
    overallScores[a] > overallScores[b] ? a : b
  );

  results.winner.throughput = Object.keys(categoryScores.throughput).reduce((a, b) =>
    categoryScores.throughput[a] > categoryScores.throughput[b] ? a : b
  );

  results.winner.latency = Object.keys(categoryScores.latency).reduce((a, b) =>
    categoryScores.latency[a] < categoryScores.latency[b] ? a : b
  );

  results.winner.scalability = Object.keys(categoryScores.scalability).reduce((a, b) =>
    categoryScores.scalability[a] > categoryScores.scalability[b] ? a : b
  );

  results.winner.reliability = Object.keys(categoryScores.reliability).reduce((a, b) =>
    categoryScores.reliability[a] > categoryScores.reliability[b] ? a : b
  );

  // Store detailed analysis
  results.analysis = {
    overallScores,
    categoryScores,
    scenarioCount: Object.keys(scenarios).length,
    frameworkCount: frameworks.length
  };
}

/**
 * Display comprehensive results
 */
function displayResults() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 ENHANCED FRAMEWORK SHOWDOWN RESULTS');
  console.log('='.repeat(100));

  // Overall winner
  console.log(`\n🥇 OVERALL WINNER: ${results.winner.overall?.toUpperCase() || 'Unknown'}`);

  // Category winners
  console.log('\n🏆 CATEGORY WINNERS:');
  console.log(`   🚀 Best Throughput: ${results.winner.throughput?.toUpperCase() || 'Unknown'}`);
  console.log(`   ⚡ Best Latency: ${results.winner.latency?.toUpperCase() || 'Unknown'}`);
  console.log(`   📈 Best Scalability: ${results.winner.scalability?.toUpperCase() || 'Unknown'}`);
  console.log(`   🛡️  Best Reliability: ${results.winner.reliability?.toUpperCase() || 'Unknown'}`);

  // Detailed rankings
  console.log('\n📊 DETAILED RANKINGS:');
  if (results.analysis && results.analysis.overallScores) {
    const sortedFrameworks = Object.entries(results.analysis.overallScores)
      .sort(([,a], [,b]) => b - a);

    sortedFrameworks.forEach(([framework, score], index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      console.log(`   ${medal} ${framework.toUpperCase()} - Overall Score: ${score.toFixed(2)}`);

      if (results.analysis.categoryScores) {
        const throughput = results.analysis.categoryScores.throughput[framework] || 0;
        const latency = results.analysis.categoryScores.latency[framework] || 0;
        const scalability = results.analysis.categoryScores.scalability[framework] || 0;
        const reliability = results.analysis.categoryScores.reliability[framework] || 0;

        console.log(`      📈 Avg Throughput: ${throughput.toFixed(0)} req/s`);
        console.log(`      ⏱️  Avg Latency: ${latency.toFixed(2)}ms`);
        console.log(`      📊 Scalability: ${(scalability * 100).toFixed(1)}%`);
        console.log(`      ✅ Reliability: ${reliability.toFixed(1)}%`);
      }
      console.log('');
    });
  }

  // Scenario winners
  console.log('\n🎯 SCENARIO WINNERS:');
  for (const [scenario, winner] of Object.entries(results.winner)) {
    if (!['overall', 'throughput', 'latency', 'scalability', 'reliability'].includes(scenario)) {
      console.log(`   ${scenario.replace(/([A-Z])/g, ' $1').trim()}: ${winner?.toUpperCase() || 'Unknown'}`);
    }
  }

  // Performance insights
  console.log('\n💡 PERFORMANCE INSIGHTS:');
  if (results.analysis) {
    console.log(`   📊 Total Scenarios Tested: ${results.analysis.scenarioCount}`);
    console.log(`   🏗️  Frameworks Compared: ${results.analysis.frameworkCount}`);
    console.log(`   🔄 Concurrency Levels: 10, 25, 50, 100, 200`);
    console.log(`   📈 Multiple performance metrics analyzed`);
    console.log(`   🧠 Memory usage monitored`);
    console.log(`   📊 Scalability scored`);
  }

  // Performance comparison table
  console.log('\n📈 PERFORMANCE COMPARISON:');
  console.log(''.padEnd(25) + Object.keys(results.frameworks).map(f => f.padStart(12)).join(''));
  console.log('-'.repeat(80));

  for (const scenario of Object.keys(scenarios)) {
    let line = scenario.padEnd(25);

    for (const framework of Object.keys(results.frameworks)) {
      const result = results.frameworks[framework][scenario];
      if (result && !result.error) {
        line += `${result.throughput.toFixed(0).padStart(12)}`;
      } else {
        line += 'ERROR'.padStart(12);
      }
    }

    console.log(line);
  }

  console.log('\n(Numbers show requests per second)');
}

/**
 * Save results to file
 */
async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `framework-showdown-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(results, null, 2));

  return filepath;
}

// Run if this file is executed directly
if (require.main === module) {
  runFrameworkShowdown().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runFrameworkShowdown, CONFIG };
