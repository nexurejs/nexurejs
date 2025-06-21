#!/usr/bin/env node

/**
 * Advanced Framework Benchmark System
 * Features:
 * - Multiple framework support (Express, Fastify, Koa, Hapi, Restify)
 * - Result persistence and trend analysis
 * - Enhanced performance metrics and memory monitoring
 * - HTML visualization dashboard
 * - Comprehensive test scenarios
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const os = require('os');

// Configuration
const CONFIG = {
  frameworks: ['express', 'fastify', 'nexurejs', 'koa'],
  concurrencyLevels: [10, 25, 50, 100],
  testRequests: 1000,
  warmupRequests: 200,
  serverStartDelay: 3000,
  resultsDirectory: path.join(__dirname, '../benchmark-results'),
  basePort: 3000,
  enableVisualization: true
};

// Global results storage
const results = {
  metadata: {
    timestamp: new Date().toISOString(),
    testId: crypto.randomUUID(),
    config: CONFIG,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      hostname: os.hostname()
    }
  },
  frameworks: {},
  comparison: {},
  trends: {}
};

// Utility functions
function log(message, level = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[level]}[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${colors.reset}`);
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

    const calculateStats = (values) => {
      const sorted = values.sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);

      return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)]
      };
    };

    return {
      sampleCount: this.samples.length,
      duration: this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp,
      rss: calculateStats(this.samples.map(s => s.rss)),
      heapUsed: calculateStats(this.samples.map(s => s.heapUsed)),
      heapTotal: calculateStats(this.samples.map(s => s.heapTotal)),
      external: calculateStats(this.samples.map(s => s.external))
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

  'CPU Intensive Task': (baseUrl) => () => {
    const numbers = Array.from({length: 1000}, () => Math.floor(Math.random() * 1000));
    return makeRequest(`${baseUrl}/api/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers })
    });
  },

  'Large JSON Response': (baseUrl) => () =>
    makeRequest(`${baseUrl}/api/export/large`, { method: 'GET' })
};

// Server generators
function createExpressServer(port) {
  const serverCode = `
const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.header('X-Framework', 'Express');
  next();
});

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
  const users = Array.from({length: limit}, (_, i) => ({
    id: (page - 1) * limit + i + 1,
    name: \`User \${(page - 1) * limit + i + 1}\`,
    email: \`user\${(page - 1) * limit + i + 1}@example.com\`
  }));
  res.json({ data: users, pagination: { page, limit, total: 1000 } });
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
    users: Array.from({length: 1000}, (_, i) => ({
      id: i + 1,
      name: \`User \${i + 1}\`,
      data: 'x'.repeat(100)
    })),
    metadata: { exported: Date.now(), size: 'large' }
  };
  res.json(largeData);
});

app.listen(${port}, () => {
  console.log('Express server running on port ${port}');
});
`;

  return { code: serverCode, filename: `express-server-${port}.cjs` };
}

function createFastifyServer(port) {
  const serverCode = `
const fastify = require('fastify')({ logger: false });
const crypto = require('crypto');

fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello from Fastify!', timestamp: Date.now() };
});

fastify.post('/api/users', async (request, reply) => {
  const user = { id: crypto.randomUUID(), ...request.body, created: Date.now() };
  return user;
});

fastify.get('/api/users', async (request, reply) => {
  const page = parseInt(request.query.page) || 1;
  const limit = parseInt(request.query.limit) || 10;
  const users = Array.from({length: limit}, (_, i) => ({
    id: (page - 1) * limit + i + 1,
    name: \`User \${(page - 1) * limit + i + 1}\`,
    email: \`user\${(page - 1) * limit + i + 1}@example.com\`
  }));
  return { data: users, pagination: { page, limit, total: 1000 } };
});

fastify.post('/api/compute', async (request, reply) => {
  const { numbers } = request.body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  return { result: result.toFixed(2), operations: numbers.length * 50 };
});

fastify.get('/api/export/large', async (request, reply) => {
  const largeData = {
    users: Array.from({length: 1000}, (_, i) => ({
      id: i + 1,
      name: \`User \${i + 1}\`,
      data: 'x'.repeat(100)
    })),
    metadata: { exported: Date.now(), size: 'large' }
  };
  return largeData;
});

const start = async () => {
  try {
    await fastify.listen({ port: ${port} });
    console.log('Fastify server running on port ${port}');
  } catch (err) {
    console.error('Error starting Fastify server:', err);
    process.exit(1);
  }
};
start();
`;

  return { code: serverCode, filename: `fastify-server-${port}.cjs` };
}

function createNexureJSServer(port) {
  const { createNexureJSServer } = require('./nexurejs-server-generator.cjs');
  return createNexureJSServer(port);
}

function createKoaServer(port) {
  const serverCode = `
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const crypto = require('crypto');

const app = new Koa();
const router = new Router();

// Test data
const testData = {
  users: Array.from({length: 1000}, (_, i) => ({
    id: i + 1,
    name: \`User \${i + 1}\`,
    email: \`user\${i + 1}@example.com\`
  }))
};

app.use(bodyParser({ jsonLimit: '50mb' }));
app.use(async (ctx, next) => {
  ctx.set('X-Framework', 'Koa');
  await next();
});

router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from Koa!', timestamp: Date.now() };
});

router.post('/api/users', (ctx) => {
  const user = { id: crypto.randomUUID(), ...ctx.request.body, created: Date.now() };
  ctx.body = user;
});

router.get('/api/users', (ctx) => {
  const page = parseInt(ctx.query.page) || 1;
  const limit = parseInt(ctx.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  ctx.body = { data: users, pagination: { page, limit, total: testData.users.length } };
});

router.post('/api/compute', (ctx) => {
  const { numbers } = ctx.request.body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  ctx.body = { result: result.toFixed(2), operations: numbers.length * 50 };
});

router.get('/api/export/large', (ctx) => {
  const largeData = {
    users: testData.users,
    metadata: { exported: Date.now(), size: 'large' }
  };
  ctx.body = largeData;
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(${port}, () => {
  console.log('Koa server running on port ${port}');
});
`;

  return { code: serverCode, filename: `koa-server-${port}.cjs` };
}

// Server management
async function startServer(framework, port) {
  let serverConfig;

  switch (framework) {
    case 'express':
      serverConfig = createExpressServer(port);
      break;
    case 'fastify':
      serverConfig = createFastifyServer(port);
      break;
    case 'nexurejs':
      serverConfig = createNexureJSServer(port);
      break;
    case 'koa':
      serverConfig = createKoaServer(port);
      break;
    default:
      throw new Error(`Unsupported framework: ${framework}`);
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
      const output = data.toString();
      if (output.includes('running on port')) {
        clearTimeout(timeout);
        resolve({
          process: serverProcess,
          port,
          framework,
          cleanup: async () => {
            serverProcess.kill();
            try {
              await fs.unlink(serverPath);
            } catch (err) {
              // File might already be deleted
            }
          }
        });
      }
    });

    serverProcess.stderr.on('data', (data) => {
      log(`Server ${framework} error: ${data.toString()}`, 'error');
    });

    serverProcess.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Server ${framework} exited with code ${code}`));
      }
    });
  });
}

// Statistics calculation
function calculateStatistics(results) {
  if (!results || results.length === 0) return null;

  const successful = results.filter(r => r.success);
  const responseTimes = successful.map(r => r.responseTime);

  if (responseTimes.length === 0) return null;

  const sorted = responseTimes.sort((a, b) => a - b);
  const totalTime = results.reduce((sum, r) => sum + r.responseTime, 0);

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: results.length - successful.length,
    successRate: (successful.length / results.length) * 100,

    responseTime: {
      min: Math.min(...responseTimes),
      max: Math.max(...responseTimes),
      mean: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    },

    throughput: {
      requestsPerSecond: (successful.length / (totalTime / 1000)) || 0
    }
  };
}

// Performance scoring
function calculatePerformanceScore(stats, concurrencyLevel) {
  if (!stats || stats.successRate < 50) return 0;

  const throughputScore = Math.min(stats.throughput.requestsPerSecond / 1000, 1) * 100;
  const latencyScore = Math.max(0, (1000 - stats.responseTime.p95) / 1000) * 100;
  const reliabilityScore = stats.successRate;

  return (throughputScore * 0.4 + latencyScore * 0.4 + reliabilityScore * 0.2);
}

// Main benchmark execution
async function runBenchmarkForFramework(framework) {
  log(`Starting benchmark for ${framework}`, 'info');

  const port = CONFIG.basePort + CONFIG.frameworks.indexOf(framework) + 1;
  let server = null;

  try {
    // Start server
    server = await startServer(framework, port);
    log(`${framework} server started on port ${port}`, 'success');

    // Wait for server to stabilize
    await new Promise(resolve => setTimeout(resolve, CONFIG.serverStartDelay));

    const frameworkResults = {
      framework,
      port,
      scenarios: {},
      summary: {}
    };

    // Run scenarios
    for (const [scenarioName, scenarioFunction] of Object.entries(scenarios)) {
      log(`Running scenario: ${scenarioName} for ${framework}`, 'info');

      const scenarioResults = {
        scenario: scenarioName,
        concurrency: {},
        aggregate: {}
      };

      // Test across different concurrency levels
      for (const concurrency of CONFIG.concurrencyLevels) {
        log(`Testing ${framework} - ${scenarioName} with concurrency ${concurrency}`, 'info');

        const memoryMonitor = new MemoryMonitor();
        memoryMonitor.start(1000);

        try {
          // Warmup
          await runLoadTest(
            scenarioFunction(`http://localhost:${port}`),
            Math.min(concurrency, 10),
            CONFIG.warmupRequests
          );

          // Actual test
          const testResults = await runLoadTest(
            scenarioFunction(`http://localhost:${port}`),
            concurrency,
            CONFIG.testRequests
          );

          const memoryStats = memoryMonitor.stop();
          const stats = calculateStatistics(testResults);
          const performanceScore = calculatePerformanceScore(stats, concurrency);

          scenarioResults.concurrency[concurrency] = {
            concurrency,
            stats,
            memoryStats,
            performanceScore
          };

          // Stop testing if success rate is too low
          if (stats && stats.successRate < 50) {
            log(`${framework} failed ${scenarioName} at concurrency ${concurrency}`, 'warning');
            break;
          }

        } catch (error) {
          log(`Error testing ${framework} - ${scenarioName}: ${error.message}`, 'error');
          scenarioResults.concurrency[concurrency] = {
            concurrency,
            error: error.message,
            performanceScore: 0
          };
          break;
        } finally {
          memoryMonitor.stop();
        }
      }

      // Calculate aggregate statistics for this scenario
      const validResults = Object.values(scenarioResults.concurrency).filter(r => !r.error && r.stats);
      if (validResults.length > 0) {
        scenarioResults.aggregate = {
          avgThroughput: validResults.reduce((sum, r) => sum + r.stats.throughput.requestsPerSecond, 0) / validResults.length,
          avgLatency: validResults.reduce((sum, r) => sum + r.stats.responseTime.mean, 0) / validResults.length,
          avgSuccessRate: validResults.reduce((sum, r) => sum + r.stats.successRate, 0) / validResults.length,
          avgPerformanceScore: validResults.reduce((sum, r) => sum + r.performanceScore, 0) / validResults.length
        };
      }

      frameworkResults.scenarios[scenarioName] = scenarioResults;
    }

    // Calculate overall framework performance
    const allScenarios = Object.values(frameworkResults.scenarios);
    const validScenarios = allScenarios.filter(s => s.aggregate && s.aggregate.avgPerformanceScore > 0);

    if (validScenarios.length > 0) {
      frameworkResults.summary = {
        overallScore: validScenarios.reduce((sum, s) => sum + s.aggregate.avgPerformanceScore, 0) / validScenarios.length,
        avgThroughput: validScenarios.reduce((sum, s) => sum + s.aggregate.avgThroughput, 0) / validScenarios.length,
        avgLatency: validScenarios.reduce((sum, s) => sum + s.aggregate.avgLatency, 0) / validScenarios.length,
        avgSuccessRate: validScenarios.reduce((sum, s) => sum + s.aggregate.avgSuccessRate, 0) / validScenarios.length,
        scenariosCompleted: validScenarios.length,
        totalScenarios: allScenarios.length
      };
    }

    results.frameworks[framework] = frameworkResults;
    log(`Completed benchmark for ${framework} (Score: ${frameworkResults.summary.overallScore?.toFixed(2) || 'N/A'})`, 'success');

  } catch (error) {
    log(`Failed to benchmark ${framework}: ${error.message}`, 'error');
    results.frameworks[framework] = {
      framework,
      error: error.message,
      summary: { overallScore: 0 }
    };
  } finally {
    if (server) {
      await server.cleanup();
    }
  }
}

// Result persistence
async function saveResults() {
  try {
    await fs.mkdir(CONFIG.resultsDirectory, { recursive: true });

    const filename = `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(CONFIG.resultsDirectory, filename);

    await fs.writeFile(filepath, JSON.stringify(results, null, 2));
    log(`Results saved to ${filepath}`, 'success');

    // Also save as latest.json
    const latestPath = path.join(CONFIG.resultsDirectory, 'latest.json');
    await fs.writeFile(latestPath, JSON.stringify(results, null, 2));

    return filepath;
  } catch (error) {
    log(`Failed to save results: ${error.message}`, 'error');
  }
}

// Generate comparison analysis
function generateComparison() {
  const frameworks = Object.keys(results.frameworks);
  const comparison = {
    rankings: [],
    categories: {
      throughput: {},
      latency: {},
      reliability: {},
      overall: {}
    },
    insights: []
  };

  // Overall rankings
  const frameworkScores = frameworks.map(framework => ({
    framework,
    score: results.frameworks[framework].summary?.overallScore || 0,
    summary: results.frameworks[framework].summary
  })).filter(f => f.score > 0).sort((a, b) => b.score - a.score);

  comparison.rankings = frameworkScores;

  // Category winners
  if (frameworkScores.length > 0) {
    const throughputWinner = frameworkScores.reduce((max, current) =>
      (current.summary?.avgThroughput || 0) > (max.summary?.avgThroughput || 0) ? current : max
    );

    const latencyWinner = frameworkScores.reduce((min, current) =>
      (current.summary?.avgLatency || Infinity) < (min.summary?.avgLatency || Infinity) ? current : min
    );

    comparison.categories.throughput.winner = throughputWinner.framework;
    comparison.categories.latency.winner = latencyWinner.framework;
    comparison.categories.overall.winner = frameworkScores[0].framework;

    // Generate insights
    if (frameworkScores.length >= 2) {
      const best = frameworkScores[0];
      const second = frameworkScores[1];
      const improvement = ((best.score - second.score) / second.score * 100).toFixed(1);

      comparison.insights.push(
        `${best.framework} outperformed ${second.framework} by ${improvement}% overall`,
        `Best throughput: ${throughputWinner.framework} (${throughputWinner.summary.avgThroughput.toFixed(0)} req/s)`,
        `Best latency: ${latencyWinner.framework} (${latencyWinner.summary.avgLatency.toFixed(1)}ms avg)`
      );
    }
  }

  results.comparison = comparison;
}

// Main execution
async function runBenchmark() {
  log('🚀 Starting Advanced Framework Benchmark System', 'info');
  log(`Testing frameworks: ${CONFIG.frameworks.join(', ')}`, 'info');

  // Run benchmarks for each framework
  for (const framework of CONFIG.frameworks) {
    await runBenchmarkForFramework(framework);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Generate analysis
  log('Generating comparison analysis...', 'info');
  generateComparison();

  // Save results
  log('Saving benchmark results...', 'info');
  const resultFile = await saveResults();

  // Display summary
  displaySummary();

  // Generate visualization
  if (CONFIG.enableVisualization) {
    log('Generating visualization dashboard...', 'info');
    await generateVisualizationDashboard();
  }

  log('✅ Benchmark completed successfully!', 'success');
  if (resultFile) {
    log(`📊 Results: ${resultFile}`, 'info');
  }
}

// Display summary
function displaySummary() {
  console.log('\n' + '='.repeat(80));
  console.log('🏆 BENCHMARK RESULTS SUMMARY');
  console.log('='.repeat(80));

  if (results.comparison.rankings.length === 0) {
    console.log('❌ No successful benchmark results');
    return;
  }

  // Overall rankings
  console.log('\n📊 Performance Rankings:');
  results.comparison.rankings.forEach((item, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : `${index + 1}.`;
    console.log(`${medal} ${item.framework.toUpperCase()} - Score: ${item.score.toFixed(2)}`);
    if (item.summary) {
      console.log(`   Throughput: ${item.summary.avgThroughput.toFixed(0)} req/s | Latency: ${item.summary.avgLatency.toFixed(1)}ms`);
    }
  });

  // Key insights
  if (results.comparison.insights.length > 0) {
    console.log('\n💡 Key Insights:');
    results.comparison.insights.forEach(insight => {
      console.log(`   • ${insight}`);
    });
  }

  console.log('\n' + '='.repeat(80));
}

// Generate HTML visualization dashboard
async function generateVisualizationDashboard() {
  const dashboardHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Framework Benchmark Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .stat-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .stat-value { font-size: 2.5em; font-weight: bold; color: #667eea; }
        .chart-container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .chart-wrapper { position: relative; height: 400px; }
        .rankings { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .ranking-item { display: flex; align-items: center; padding: 15px 0; border-bottom: 1px solid #eee; }
        .rank { font-size: 1.5em; margin-right: 20px; }
        .framework-name { font-weight: bold; flex: 1; font-size: 1.2em; }
        .score { color: #667eea; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Framework Benchmark Dashboard</h1>
            <p>Generated on ${new Date(results.metadata.timestamp).toLocaleString()}</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Frameworks Tested</h3>
                <div class="stat-value">${Object.keys(results.frameworks).length}</div>
            </div>
            <div class="stat-card">
                <h3>Test Scenarios</h3>
                <div class="stat-value">${Object.keys(scenarios).length}</div>
            </div>
            <div class="stat-card">
                <h3>Best Performer</h3>
                <div class="stat-value">${results.comparison.categories?.overall?.winner || 'N/A'}</div>
            </div>
        </div>

        <div class="chart-container">
            <h2>📊 Performance Comparison</h2>
            <div class="chart-wrapper">
                <canvas id="performanceChart"></canvas>
            </div>
        </div>

        <div class="rankings">
            <h2>🏆 Final Rankings</h2>
            ${results.comparison.rankings.map((item, index) => `
                <div class="ranking-item">
                    <div class="rank">${index === 0 ? '🥇' : index === 1 ? '🥈' : `${index + 1}.`}</div>
                    <div class="framework-name">${item.framework.toUpperCase()}</div>
                    <div class="score">${item.score.toFixed(2)}</div>
                </div>
            `).join('')}
        </div>
    </div>

    <script>
        const results = ${JSON.stringify(results)};

        // Performance chart
        const ctx = document.getElementById('performanceChart').getContext('2d');
        const frameworks = results.comparison.rankings.map(r => r.framework.toUpperCase());
        const scores = results.comparison.rankings.map(r => r.score);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: frameworks,
                datasets: [{
                    label: 'Performance Score',
                    data: scores,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    </script>
</body>
</html>
  `;

  try {
    const dashboardPath = path.join(CONFIG.resultsDirectory, 'dashboard.html');
    await fs.writeFile(dashboardPath, dashboardHtml);
    log(`📊 Dashboard generated: ${dashboardPath}`, 'success');
  } catch (error) {
    log(`Failed to generate dashboard: ${error.message}`, 'error');
  }
}

// CLI handling
if (require.main === module) {
  runBenchmark().catch(error => {
    log(`Benchmark failed: ${error.message}`, 'error');
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { runBenchmark, CONFIG, results, scenarios };
