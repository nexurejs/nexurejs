#!/usr/bin/env node

/**
 * Comprehensive Framework Benchmark System
 * Features:
 * - Multiple framework support (Express, Fastify, Koa, Hapi, Restify, NestJS)
 * - Result persistence and trend analysis
 * - Enhanced performance metrics
 * - Memory monitoring
 * - Scalability testing
 * - Comprehensive test scenarios
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  frameworks: ['express', 'fastify', 'koa', 'hapi', 'restify'],
  concurrencyLevels: [10, 25, 50, 100],
  testRequests: 1000,
  warmupRequests: 200,
  serverStartDelay: 3000,
  maxTestDuration: 30000,
  resultsDirectory: path.join(__dirname, '../benchmark-results'),
  enableVisualization: true
};

// Results storage
const results = {
  metadata: {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCount: require('os').cpus().length,
      totalMemory: require('os').totalmem(),
      freeMemory: require('os').freemem()
    }
  },
  frameworks: {},
  comparison: {},
  trends: {},
  analysis: {}
};

// Utility functions
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
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

// Memory monitoring class
class MemoryMonitor {
  constructor() {
    this.samples = [];
    this.isMonitoring = false;
    this.interval = null;
  }

  start(intervalMs = 1000) {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.samples = [];

    this.interval = setInterval(() => {
      const memUsage = process.memoryUsage();
      this.samples.push({
        timestamp: Date.now(),
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      });
    }, intervalMs);
  }

  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    return this.getStats();
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const stats = {
      sampleCount: this.samples.length,
      duration: this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp,
      rss: this.calculateStats(this.samples.map(s => s.rss)),
      heapUsed: this.calculateStats(this.samples.map(s => s.heapUsed)),
      heapTotal: this.calculateStats(this.samples.map(s => s.heapTotal)),
      external: this.calculateStats(this.samples.map(s => s.external))
    };

    return stats;
  }

  calculateStats(values) {
    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}

// Request utilities
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

// Test scenarios
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

  'Middleware Chain Test': (baseUrl) => () => {
    const testData = { message: 'test middleware chain', data: Math.random() };
    return makeRequest(`${baseUrl}/api/middleware/chain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
  }
};

module.exports = {
  CONFIG,
  results,
  scenarios,
  MemoryMonitor,
  makeRequest,
  runLoadTest,
  generateTestData,
  log
};

// Run benchmark if called directly
if (require.main === module) {
  // This will be implemented in the main function
  log('Comprehensive Framework Benchmark System initialized');
  log('Run with: node comprehensive-framework-benchmark.cjs --run');
}
