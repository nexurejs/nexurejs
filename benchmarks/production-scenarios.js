#!/usr/bin/env node

/**
 * Production Scenarios Benchmark for NexureJS
 * Tests real-world production scenarios and use cases
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONFIG = {
  duration: 60000, // 1 minute
  concurrency: 50,
  warmupTime: 10000, // 10 seconds
  scenarios: [
    {
      name: 'REST API CRUD Operations',
      weight: 30,
      endpoints: [
        { method: 'GET', path: '/api/users', weight: 40 },
        { method: 'POST', path: '/api/users', weight: 20 },
        { method: 'GET', path: '/api/users/:id', weight: 25 },
        { method: 'PUT', path: '/api/users/:id', weight: 10 },
        { method: 'DELETE', path: '/api/users/:id', weight: 5 }
      ]
    },
    {
      name: 'File Upload & Processing',
      weight: 20,
      endpoints: [
        { method: 'POST', path: '/api/upload', size: '1MB', weight: 60 },
        { method: 'POST', path: '/api/upload/bulk', size: '5MB', weight: 30 },
        { method: 'GET', path: '/api/files', weight: 10 }
      ]
    },
    {
      name: 'Real-time WebSocket',
      weight: 15,
      type: 'websocket',
      endpoints: [
        { event: 'chat_message', weight: 50 },
        { event: 'user_status', weight: 30 },
        { event: 'notification', weight: 20 }
      ]
    },
    {
      name: 'Data Processing & Analytics',
      weight: 20,
      endpoints: [
        { method: 'GET', path: '/api/analytics/dashboard', weight: 40 },
        { method: 'POST', path: '/api/analytics/query', weight: 35 },
        { method: 'GET', path: '/api/reports/generate', weight: 25 }
      ]
    },
    {
      name: 'Authentication & Security',
      weight: 15,
      endpoints: [
        { method: 'POST', path: '/api/auth/login', weight: 40 },
        { method: 'POST', path: '/api/auth/refresh', weight: 35 },
        { method: 'GET', path: '/api/auth/profile', weight: 25 }
      ]
    }
  ]
};

// Global results storage
const results = {
  scenarios: {},
  summary: {},
  metrics: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgResponseTime: 0,
    throughput: 0,
    errors: []
  },
  timestamp: new Date().toISOString(),
  config: CONFIG
};

/**
 * Generate realistic test data
 */
function generateTestData() {
  const names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana'];
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com'];

  return {
    user: {
      name: names[Math.floor(Math.random() * names.length)] + ' ' + names[Math.floor(Math.random() * names.length)],
      email: `user${Math.floor(Math.random() * 1000)}@${domains[Math.floor(Math.random() * domains.length)]}`,
      age: Math.floor(Math.random() * 50) + 18,
      role: Math.random() > 0.8 ? 'admin' : 'user',
      created: new Date().toISOString()
    },
    file: Buffer.alloc(1024 * Math.floor(Math.random() * 1000) + 1024).toString('base64'), // 1-1000KB
    analytics: {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
      metrics: ['pageviews', 'users', 'sessions', 'bounceRate'],
      filters: { country: 'US', device: 'desktop' }
    }
  };
}

/**
 * HTTP Request Helper
 */
async function makeRequest(url, options = {}) {
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeout);
    const end = performance.now();

    const result = {
      success: response.ok,
      status: response.status,
      responseTime: end - start,
      timestamp: Date.now()
    };

    if (response.ok) {
      try {
        result.data = await response.json();
      } catch (e) {
        result.data = await response.text();
      }
    }

    return result;

  } catch (error) {
    const end = performance.now();
    return {
      success: false,
      error: error.message,
      responseTime: end - start,
      timestamp: Date.now()
    };
  }
}

/**
 * Worker thread for concurrent requests
 */
async function workerTask() {
  if (!isMainThread) {
    const { scenario, baseUrl, duration, workerId } = workerData;
    const results = [];
    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      // Select random endpoint based on weights
      const endpoint = selectWeightedEndpoint(scenario.endpoints);
      const testData = generateTestData();

      let requestOptions = {
        method: endpoint.method || 'GET',
        headers: { 'Content-Type': 'application/json' }
      };

      // Add request body for POST/PUT requests
      if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
        if (endpoint.path.includes('upload')) {
          requestOptions.body = testData.file;
          requestOptions.headers['Content-Type'] = 'application/octet-stream';
        } else if (endpoint.path.includes('analytics')) {
          requestOptions.body = JSON.stringify(testData.analytics);
        } else {
          requestOptions.body = JSON.stringify(testData.user);
        }
      }

      // Replace path parameters
      let url = baseUrl + endpoint.path;
      if (endpoint.path.includes(':id')) {
        url = url.replace(':id', Math.floor(Math.random() * 1000) + 1);
      }

      const result = await makeRequest(url, requestOptions);
      result.endpoint = endpoint.path;
      result.scenario = scenario.name;
      result.workerId = workerId;

      results.push(result);

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    }

    parentPort.postMessage({ workerId, results });
  }
}

/**
 * Select endpoint based on weights
 */
function selectWeightedEndpoint(endpoints) {
  const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;

  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint;
    }
  }

  return endpoints[0]; // fallback
}

/**
 * Run WebSocket scenario
 */
async function runWebSocketScenario(scenario, baseUrl) {
  console.log(`Running WebSocket scenario: ${scenario.name}`);

  const WebSocket = require('ws');
  const connections = [];
  const messages = [];

  const wsUrl = baseUrl.replace('http', 'ws') + '/ws';

  // Create connections
  for (let i = 0; i < CONFIG.concurrency / 2; i++) {
    try {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        connections.push(ws);
      });

      ws.on('message', (data) => {
        messages.push({
          timestamp: Date.now(),
          data: data.toString(),
          connectionId: i
        });
      });

      ws.on('error', (error) => {
        console.log(`WebSocket error: ${error.message}`);
      });

    } catch (error) {
      console.log(`Failed to create WebSocket connection: ${error.message}`);
    }
  }

  // Wait for connections
  await new Promise(resolve => setTimeout(resolve, 2000));

  const startTime = Date.now();
  const testDuration = CONFIG.duration / 4; // Shorter test for WebSocket

  // Send messages
  const messageInterval = setInterval(() => {
    if (Date.now() - startTime > testDuration) {
      clearInterval(messageInterval);
      return;
    }

    connections.forEach((ws, index) => {
      if (ws.readyState === WebSocket.OPEN) {
        const endpoint = selectWeightedEndpoint(scenario.endpoints);
        const message = {
          event: endpoint.event,
          data: generateTestData(),
          timestamp: Date.now()
        };

        ws.send(JSON.stringify(message));
      }
    });
  }, 100);

  // Wait for test completion
  await new Promise(resolve => setTimeout(resolve, testDuration + 1000));

  // Close connections
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  return {
    scenario: scenario.name,
    connections: connections.length,
    messagesSent: connections.length * (testDuration / 100),
    messagesReceived: messages.length,
    avgLatency: messages.length > 0 ?
      messages.reduce((sum, msg) => sum + (Date.now() - msg.timestamp), 0) / messages.length : 0
  };
}

/**
 * Run HTTP scenario with workers
 */
async function runHttpScenario(scenario, baseUrl) {
  console.log(`Running HTTP scenario: ${scenario.name}`);

  const workers = [];
  const allResults = [];

  // Create worker threads
  for (let i = 0; i < CONFIG.concurrency; i++) {
    const worker = new Worker(__filename, {
      workerData: {
        scenario,
        baseUrl,
        duration: CONFIG.duration,
        workerId: i
      }
    });

    worker.on('message', (message) => {
      allResults.push(...message.results);
    });

    workers.push(worker);
  }

  // Wait for all workers to complete
  await Promise.all(workers.map(worker =>
    new Promise(resolve => worker.on('exit', resolve))
  ));

  // Analyze results
  const successful = allResults.filter(r => r.success);
  const failed = allResults.filter(r => !r.success);

  const responseTimes = successful.map(r => r.responseTime);
  responseTimes.sort((a, b) => a - b);

  return {
    scenario: scenario.name,
    totalRequests: allResults.length,
    successful: successful.length,
    failed: failed.length,
    successRate: successful.length / allResults.length * 100,
    avgResponseTime: responseTimes.length > 0 ?
      responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length : 0,
    p50: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
    p95: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
    p99: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
    throughput: successful.length / (CONFIG.duration / 1000),
    errors: failed.map(f => f.error).filter(Boolean)
  };
}

/**
 * Create test server
 */
async function createTestServer() {
  const serverCode = `
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ limit: '10mb', type: 'application/octet-stream' }));

// In-memory storage
let users = [];
let files = [];
let sessions = [];

// Middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// REST API Routes
app.get('/api/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;

  res.json({
    data: users.slice(start, start + limit),
    total: users.length,
    page,
    pages: Math.ceil(users.length / limit)
  });
});

app.post('/api/users', (req, res) => {
  const user = {
    id: crypto.randomUUID(),
    ...req.body,
    created: new Date().toISOString()
  };
  users.push(user);
  res.status(201).json(user);
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.put('/api/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });

  users[index] = { ...users[index], ...req.body, updated: new Date().toISOString() };
  res.json(users[index]);
});

app.delete('/api/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });

  users.splice(index, 1);
  res.status(204).send();
});

// File Upload Routes
app.post('/api/upload', (req, res) => {
  const file = {
    id: crypto.randomUUID(),
    size: req.body.length,
    uploaded: new Date().toISOString()
  };
  files.push(file);
  res.json(file);
});

app.post('/api/upload/bulk', (req, res) => {
  const file = {
    id: crypto.randomUUID(),
    size: req.body.length,
    type: 'bulk',
    uploaded: new Date().toISOString()
  };
  files.push(file);
  res.json(file);
});

app.get('/api/files', (req, res) => {
  res.json({ data: files, total: files.length });
});

// Analytics Routes
app.get('/api/analytics/dashboard', (req, res) => {
  // Simulate complex computation
  const data = {
    users: Math.floor(Math.random() * 10000),
    sessions: Math.floor(Math.random() * 50000),
    pageviews: Math.floor(Math.random() * 100000),
    revenue: Math.floor(Math.random() * 50000),
    timestamp: new Date().toISOString()
  };

  // Add some CPU load
  let result = 0;
  for (let i = 0; i < 100000; i++) {
    result += Math.sqrt(i);
  }

  res.json(data);
});

app.post('/api/analytics/query', (req, res) => {
  const { startDate, endDate, metrics } = req.body;

  // Simulate database query
  const results = metrics.map(metric => ({
    metric,
    values: Array.from({ length: 30 }, () => Math.floor(Math.random() * 1000)),
    period: { startDate, endDate }
  }));

  res.json({ results, query: req.body });
});

app.get('/api/reports/generate', (req, res) => {
  // Simulate report generation
  const report = {
    id: crypto.randomUUID(),
    type: req.query.type || 'summary',
    generated: new Date().toISOString(),
    data: Array.from({ length: 100 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
      value: Math.floor(Math.random() * 1000)
    }))
  };

  res.json(report);
});

// Auth Routes
app.post('/api/auth/login', (req, res) => {
  const session = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    token: crypto.randomBytes(32).toString('hex'),
    created: new Date().toISOString()
  };
  sessions.push(session);
  res.json({ token: session.token, user: { id: session.userId } });
});

app.post('/api/auth/refresh', (req, res) => {
  const session = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(32).toString('hex'),
    refreshed: new Date().toISOString()
  };
  res.json({ token: session.token });
});

app.get('/api/auth/profile', (req, res) => {
  res.json({
    id: crypto.randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    role: 'user'
  });
});

// WebSocket handling
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Echo back with processing info
      ws.send(JSON.stringify({
        ...data,
        processed: new Date().toISOString(),
        serverId: 'test-server'
      }));
    } catch (error) {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(\`Test server running on port \${PORT}\`);
});
`;

  const serverPath = path.join(__dirname, 'test-server.js');
  await fs.writeFile(serverPath, serverCode);

  return serverPath;
}

/**
 * Main benchmark execution
 */
async function runBenchmark() {
  console.log('🚀 Starting Production Scenarios Benchmark');
  console.log(`Duration: ${CONFIG.duration}ms, Concurrency: ${CONFIG.concurrency}`);

  try {
    // Create and start test server
    const serverPath = await createTestServer();
    const { spawn } = require('child_process');

    const serverProcess = spawn('node', [serverPath], {
      stdio: 'pipe',
      detached: false
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    const baseUrl = 'http://localhost:3000';

    // Warmup
    console.log('🔥 Warming up...');
    await new Promise(resolve => setTimeout(resolve, CONFIG.warmupTime));

    // Run scenarios
    for (const scenario of CONFIG.scenarios) {
      console.log(`\n📊 Running scenario: ${scenario.name}`);

      try {
        let result;

        if (scenario.type === 'websocket') {
          result = await runWebSocketScenario(scenario, baseUrl);
        } else {
          result = await runHttpScenario(scenario, baseUrl);
        }

        results.scenarios[scenario.name] = result;

        // Update global metrics
        if (result.totalRequests) {
          results.metrics.totalRequests += result.totalRequests;
          results.metrics.successfulRequests += result.successful || 0;
          results.metrics.failedRequests += result.failed || 0;
        }

        console.log(`✅ Completed: ${scenario.name}`);
        console.log(`   Throughput: ${result.throughput?.toFixed(2) || 'N/A'} req/s`);
        console.log(`   Success Rate: ${result.successRate?.toFixed(2) || 'N/A'}%`);

      } catch (error) {
        console.log(`❌ Error in scenario ${scenario.name}: ${error.message}`);
        results.scenarios[scenario.name] = { error: error.message };
      }
    }

    // Stop server
    serverProcess.kill('SIGTERM');

    // Clean up
    try {
      await fs.unlink(serverPath);
    } catch (error) {
      // Ignore cleanup errors
    }

    // Generate summary
    generateSummary();

    // Save results
    const resultsFile = await saveResults();

    console.log('\n📋 Benchmark Summary:');
    console.log(`Total Requests: ${results.metrics.totalRequests}`);
    console.log(`Success Rate: ${(results.metrics.successfulRequests / results.metrics.totalRequests * 100).toFixed(2)}%`);
    console.log(`Average Throughput: ${results.summary.avgThroughput?.toFixed(2) || 'N/A'} req/s`);
    console.log(`Results saved to: ${resultsFile}`);

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

/**
 * Generate summary statistics
 */
function generateSummary() {
  const scenarios = Object.values(results.scenarios).filter(s => !s.error);

  results.summary = {
    totalScenarios: CONFIG.scenarios.length,
    successfulScenarios: scenarios.length,
    avgThroughput: scenarios.reduce((sum, s) => sum + (s.throughput || 0), 0) / scenarios.length,
    avgResponseTime: scenarios.reduce((sum, s) => sum + (s.avgResponseTime || 0), 0) / scenarios.length,
    overallSuccessRate: results.metrics.successfulRequests / results.metrics.totalRequests * 100,
    topPerformer: scenarios.reduce((best, current) =>
      (current.throughput || 0) > (best.throughput || 0) ? current : best, scenarios[0])
  };
}

/**
 * Save results to file
 */
async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `production-benchmark-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  // Ensure results directory exists
  await fs.mkdir(resultsDir, { recursive: true });

  await fs.writeFile(filepath, JSON.stringify(results, null, 2));

  return filepath;
}

// Run benchmark if this file is executed directly
if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark();
} else if (!isMainThread) {
  workerTask();
}

export { runBenchmark, CONFIG };
