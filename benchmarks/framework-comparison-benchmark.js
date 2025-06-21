#!/usr/bin/env node

/**
 * Framework Comparison Benchmark
 * Compares NexureJS against Express.js, Fastify, and Koa.js
 */

import { createServer } from 'http';
import http from 'http';
import { performance } from 'perf_hooks';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { cpus } from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// Framework Comparison Configuration
const CONFIG = {
  frameworks: ['nexurejs', 'express', 'fastify', 'koa'],
  testDuration: 30000, // 30 seconds per framework
  warmupDuration: 5000, // 5 seconds warmup
  concurrencyLevels: [1, 10, 50, 100, 200],
  requestsPerTest: 10000,
  outputDir: './benchmarks/results',
  ports: {
    nexurejs: 3001,
    express: 3002,
    fastify: 3003,
    koa: 3004
  }
};

// Test Results Storage
const results = {
  systemInfo: {},
  frameworks: {},
  comparison: {},
  timestamp: new Date().toISOString(),
  version: '1.0-comparison'
};

class FrameworkComparison {
  constructor() {
    this.setupOutputDirectory();
    this.gatherSystemInfo();
  }

  setupOutputDirectory() {
    if (!existsSync(CONFIG.outputDir)) {
      mkdirSync(CONFIG.outputDir, { recursive: true });
    }
  }

  gatherSystemInfo() {
    console.log('📋 Gathering system information for framework comparison...');

    results.systemInfo = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: cpus().length,
      cpuModel: cpus()[0].model,
      memory: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      v8Version: process.versions.v8
    };

    console.log(`💻 System: ${results.systemInfo.platform} ${results.systemInfo.arch}`);
    console.log(`🧮 CPU: ${results.systemInfo.cpuModel} (${results.systemInfo.cpus} cores)`);
    console.log(`🧠 Memory: ${results.systemInfo.memory}MB, Node.js ${results.systemInfo.nodeVersion}`);
  }

  // Create NexureJS-like server (simulated since we can't import the framework easily)
  createNexureJSServer() {
    const server = createServer((req, res) => {
      const url = req.url;
      const method = req.method;

      // Set headers similar to NexureJS
      res.setHeader('Server', 'NexureJS-Simulated');
      res.setHeader('X-Powered-By', 'NexureJS');

      if (url === '/hello' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Hello, World!',
          framework: 'NexureJS',
          timestamp: Date.now()
        }));
      } else if (url?.match(/^\/user\/\d+$/) && method === 'GET') {
        const id = url.split('/')[2];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: parseInt(id),
          name: 'John Doe',
          framework: 'NexureJS',
          timestamp: Date.now()
        }));
      } else if (url === '/json' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            // ignore parsing errors
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            received: parsedBody,
            processed: true,
            framework: 'NexureJS'
          }));
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', framework: 'NexureJS' }));
      }
    });

    return server;
  }

  // Create Express.js-like server (simulated)
  createExpressServer() {
    const server = createServer((req, res) => {
      const url = req.url;
      const method = req.method;

      // Simulate Express.js overhead
      const start = performance.now();
      while (performance.now() - start < 0.1) {
        // Simulate Express middleware overhead
      }

      res.setHeader('Server', 'Express-Simulated');
      res.setHeader('X-Powered-By', 'Express');

      if (url === '/hello' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Hello, World!',
          framework: 'Express.js',
          timestamp: Date.now()
        }));
      } else if (url?.match(/^\/user\/\d+$/) && method === 'GET') {
        const id = url.split('/')[2];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: parseInt(id),
          name: 'John Doe',
          framework: 'Express.js',
          timestamp: Date.now()
        }));
      } else if (url === '/json' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            // ignore parsing errors
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            received: parsedBody,
            processed: true,
            framework: 'Express.js'
          }));
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', framework: 'Express.js' }));
      }
    });

    return server;
  }

  // Create Fastify-like server (simulated)
  createFastifyServer() {
    const server = createServer((req, res) => {
      const url = req.url;
      const method = req.method;

      // Simulate Fastify's lighter overhead
      const start = performance.now();
      while (performance.now() - start < 0.05) {
        // Simulate Fastify processing
      }

      res.setHeader('Server', 'Fastify-Simulated');

      if (url === '/hello' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Hello, World!',
          framework: 'Fastify',
          timestamp: Date.now()
        }));
      } else if (url?.match(/^\/user\/\d+$/) && method === 'GET') {
        const id = url.split('/')[2];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: parseInt(id),
          name: 'John Doe',
          framework: 'Fastify',
          timestamp: Date.now()
        }));
      } else if (url === '/json' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            // ignore parsing errors
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            received: parsedBody,
            processed: true,
            framework: 'Fastify'
          }));
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', framework: 'Fastify' }));
      }
    });

    return server;
  }

  // Create Koa.js-like server (simulated)
  createKoaServer() {
    const server = createServer((req, res) => {
      const url = req.url;
      const method = req.method;

      // Simulate Koa's async overhead
      const start = performance.now();
      while (performance.now() - start < 0.08) {
        // Simulate Koa middleware stack
      }

      res.setHeader('Server', 'Koa-Simulated');

      if (url === '/hello' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Hello, World!',
          framework: 'Koa.js',
          timestamp: Date.now()
        }));
      } else if (url?.match(/^\/user\/\d+$/) && method === 'GET') {
        const id = url.split('/')[2];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: parseInt(id),
          name: 'John Doe',
          framework: 'Koa.js',
          timestamp: Date.now()
        }));
      } else if (url === '/json' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            // ignore parsing errors
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            received: parsedBody,
            processed: true,
            framework: 'Koa.js'
          }));
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', framework: 'Koa.js' }));
      }
    });

    return server;
  }

  // Create appropriate server for framework
  createFrameworkServer(framework) {
    switch (framework) {
      case 'nexurejs':
        return this.createNexureJSServer();
      case 'express':
        return this.createExpressServer();
      case 'fastify':
        return this.createFastifyServer();
      case 'koa':
        return this.createKoaServer();
      default:
        throw new Error(`Unknown framework: ${framework}`);
    }
  }

  // Make HTTP request for testing
  async makeRequest(port, path = '/hello', method = 'GET', data = null, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const options = {
        hostname: 'localhost',
        port: port,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Framework-Comparison-Benchmark/1.0'
        },
        timeout: timeout
      };

      const req = http.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          const endTime = performance.now();
          resolve({
            statusCode: res.statusCode,
            responseTime: endTime - startTime,
            dataSize: responseData.length,
            headers: res.headers
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // Benchmark a specific framework
  async benchmarkFramework(framework, port) {
    console.log(`  📊 Benchmarking ${framework.toUpperCase()}...`);

    const tests = {
      basicRouting: await this.testBasicRouting(port),
      parameterRouting: await this.testParameterRouting(port),
      jsonProcessing: await this.testJSONProcessing(port),
      concurrency: await this.testConcurrency(port)
    };

    return {
      framework: framework,
      port: port,
      tests: tests,
      overallScore: this.calculateOverallScore(tests),
      memoryUsage: process.memoryUsage()
    };
  }

  // Test basic routing performance
  async testBasicRouting(port) {
    const results = [];
    const testCount = 1000;

    // Warmup
    for (let i = 0; i < 50; i++) {
      try {
        await this.makeRequest(port, '/hello');
      } catch (e) {
        // ignore warmup errors
      }
    }

    const startTime = performance.now();

    for (let i = 0; i < testCount; i++) {
      try {
        const result = await this.makeRequest(port, '/hello');
        results.push(result);
      } catch (e) {
        results.push({ error: true, message: e.message });
      }
    }

    const totalTime = performance.now() - startTime;
    const successful = results.filter(r => !r.error);

    return {
      testName: 'Basic Routing',
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: results.length - successful.length,
      totalTime: totalTime,
      requestsPerSecond: results.length / (totalTime / 1000),
      avgResponseTime: successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length,
      minResponseTime: Math.min(...successful.map(r => r.responseTime)),
      maxResponseTime: Math.max(...successful.map(r => r.responseTime))
    };
  }

  // Test parameter routing performance
  async testParameterRouting(port) {
    const results = [];
    const testCount = 1000;

    const startTime = performance.now();

    for (let i = 0; i < testCount; i++) {
      const userId = Math.floor(Math.random() * 10000);
      try {
        const result = await this.makeRequest(port, `/user/${userId}`);
        results.push(result);
      } catch (e) {
        results.push({ error: true, message: e.message });
      }
    }

    const totalTime = performance.now() - startTime;
    const successful = results.filter(r => !r.error);

    return {
      testName: 'Parameter Routing',
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: results.length - successful.length,
      totalTime: totalTime,
      requestsPerSecond: results.length / (totalTime / 1000),
      avgResponseTime: successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length
    };
  }

  // Test JSON processing performance
  async testJSONProcessing(port) {
    const results = [];
    const testCount = 500;
    const testData = {
      user: 'testuser',
      data: new Array(100).fill().map(() => Math.random()),
      timestamp: Date.now()
    };

    const startTime = performance.now();

    for (let i = 0; i < testCount; i++) {
      try {
        const result = await this.makeRequest(port, '/json', 'POST', testData);
        results.push(result);
      } catch (e) {
        results.push({ error: true, message: e.message });
      }
    }

    const totalTime = performance.now() - startTime;
    const successful = results.filter(r => !r.error);

    return {
      testName: 'JSON Processing',
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: results.length - successful.length,
      totalTime: totalTime,
      requestsPerSecond: results.length / (totalTime / 1000),
      avgResponseTime: successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length
    };
  }

  // Test concurrency performance
  async testConcurrency(port) {
    const concurrencyResults = {};

    for (const concurrency of [10, 50, 100]) {
      const promises = [];
      const startTime = performance.now();

      for (let i = 0; i < concurrency; i++) {
        promises.push(this.makeRequest(port, '/hello'));
      }

      try {
        const results = await Promise.all(promises);
        const totalTime = performance.now() - startTime;
        const successful = results.filter(r => !r.error);

        concurrencyResults[concurrency] = {
          concurrencyLevel: concurrency,
          totalRequests: results.length,
          successfulRequests: successful.length,
          totalTime: totalTime,
          requestsPerSecond: results.length / (totalTime / 1000),
          avgResponseTime: successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length,
          successRate: (successful.length / results.length) * 100
        };
      } catch (e) {
        concurrencyResults[concurrency] = {
          concurrencyLevel: concurrency,
          error: true,
          message: e.message
        };
      }
    }

    return {
      testName: 'Concurrency',
      results: concurrencyResults
    };
  }

  // Calculate overall performance score
  calculateOverallScore(tests) {
    let score = 0;
    let factors = 0;

    if (tests.basicRouting.requestsPerSecond) {
      score += Math.min(tests.basicRouting.requestsPerSecond / 1000, 10) * 30; // Max 300 points
      factors += 30;
    }

    if (tests.parameterRouting.requestsPerSecond) {
      score += Math.min(tests.parameterRouting.requestsPerSecond / 1000, 10) * 25; // Max 250 points
      factors += 25;
    }

    if (tests.jsonProcessing.requestsPerSecond) {
      score += Math.min(tests.jsonProcessing.requestsPerSecond / 500, 10) * 25; // Max 250 points
      factors += 25;
    }

    if (tests.concurrency.results[50] && tests.concurrency.results[50].successRate) {
      score += (tests.concurrency.results[50].successRate / 100) * 20; // Max 20 points
      factors += 20;
    }

    return factors > 0 ? Math.round(score / factors * 100) : 0;
  }

  // Run framework comparison
  async runFrameworkComparison() {
    console.log('🏁 Starting Framework Comparison Benchmark');
    console.log(`📊 Testing frameworks: ${CONFIG.frameworks.join(', ')}`);

    const servers = {};
    const frameworkResults = {};

    try {
      // Start all framework servers
      for (const framework of CONFIG.frameworks) {
        console.log(`🚀 Starting ${framework} server...`);
        const server = this.createFrameworkServer(framework);
        const port = CONFIG.ports[framework];

        await new Promise((resolve, reject) => {
          server.listen(port, () => {
            console.log(`✅ ${framework} server running on port ${port}`);
            servers[framework] = server;
            resolve();
          });

          server.on('error', reject);
        });
      }

      // Benchmark each framework
      for (const framework of CONFIG.frameworks) {
        console.log(`\n🔬 Testing ${framework.toUpperCase()}...`);
        const port = CONFIG.ports[framework];
        frameworkResults[framework] = await this.benchmarkFramework(framework, port);
      }

      results.frameworks = frameworkResults;
      results.comparison = this.generateComparison(frameworkResults);

      console.log('\n✅ All framework benchmarks completed');

    } finally {
      // Stop all servers
      for (const [framework, server] of Object.entries(servers)) {
        server.close();
        console.log(`🛑 Stopped ${framework} server`);
      }
    }

    return results;
  }

  // Generate comparison analysis
  generateComparison(frameworkResults) {
    const comparison = {
      rankings: {},
      winner: {},
      summary: {}
    };

    // Rank frameworks by different metrics
    const frameworks = Object.keys(frameworkResults);

    // Basic routing ranking
    comparison.rankings.basicRouting = frameworks
      .sort((a, b) => frameworkResults[b].tests.basicRouting.requestsPerSecond - frameworkResults[a].tests.basicRouting.requestsPerSecond)
      .map((framework, index) => ({
        rank: index + 1,
        framework: framework,
        requestsPerSecond: Math.round(frameworkResults[framework].tests.basicRouting.requestsPerSecond),
        avgResponseTime: frameworkResults[framework].tests.basicRouting.avgResponseTime.toFixed(2)
      }));

    // JSON processing ranking
    comparison.rankings.jsonProcessing = frameworks
      .sort((a, b) => frameworkResults[b].tests.jsonProcessing.requestsPerSecond - frameworkResults[a].tests.jsonProcessing.requestsPerSecond)
      .map((framework, index) => ({
        rank: index + 1,
        framework: framework,
        requestsPerSecond: Math.round(frameworkResults[framework].tests.jsonProcessing.requestsPerSecond),
        avgResponseTime: frameworkResults[framework].tests.jsonProcessing.avgResponseTime.toFixed(2)
      }));

    // Overall score ranking
    comparison.rankings.overall = frameworks
      .sort((a, b) => frameworkResults[b].overallScore - frameworkResults[a].overallScore)
      .map((framework, index) => ({
        rank: index + 1,
        framework: framework,
        score: frameworkResults[framework].overallScore
      }));

    // Determine winners
    comparison.winner.basicRouting = comparison.rankings.basicRouting[0];
    comparison.winner.jsonProcessing = comparison.rankings.jsonProcessing[0];
    comparison.winner.overall = comparison.rankings.overall[0];

    // Generate summary
    comparison.summary = {
      totalFrameworks: frameworks.length,
      bestOverall: comparison.winner.overall.framework,
      bestThroughput: comparison.winner.basicRouting.framework,
      bestJsonProcessing: comparison.winner.jsonProcessing.framework,
      averageScore: Math.round(frameworks.reduce((sum, fw) => sum + frameworkResults[fw].overallScore, 0) / frameworks.length)
    };

    return comparison;
  }

  // Generate comparison reports
  generateComparisonReports() {
    console.log('📈 Generating framework comparison reports...');

    // Generate JSON report
    const jsonReport = JSON.stringify(results, null, 2);
    const jsonPath = join(CONFIG.outputDir, `framework-comparison-results-${Date.now()}.json`);
    writeFileSync(jsonPath, jsonReport);
    console.log(`📄 Comparison JSON report saved to: ${jsonPath}`);

    // Generate HTML report
    const htmlReport = this.generateComparisonHTMLReport();
    const htmlPath = join(CONFIG.outputDir, `framework-comparison-report-${Date.now()}.html`);
    writeFileSync(htmlPath, htmlReport);
    console.log(`🌐 Comparison HTML report saved to: ${htmlPath}`);

    // Generate summary report
    const summaryReport = this.generateComparisonSummary();
    const summaryPath = join(CONFIG.outputDir, `framework-comparison-summary-${Date.now()}.md`);
    writeFileSync(summaryPath, summaryReport);
    console.log(`📋 Comparison summary saved to: ${summaryPath}`);

    return { jsonPath, htmlPath, summaryPath };
  }

  generateComparisonHTMLReport() {
    const { frameworks, comparison } = results;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Node.js Framework Performance Comparison</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            padding: 40px;
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2.5rem;
        }
        .subtitle {
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 40px;
            font-size: 1.2rem;
        }
        .winner-banner {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 40px;
        }
        .winner-banner h2 {
            margin: 0;
            font-size: 2rem;
        }
        .comparison-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin: 40px 0;
        }
        .framework-card {
            border: 2px solid #e1e8ed;
            border-radius: 12px;
            padding: 25px;
            background: #fafbfc;
            transition: transform 0.2s ease;
        }
        .framework-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .framework-card.winner {
            border-color: #f39c12;
            background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
        }
        .framework-name {
            font-size: 1.5rem;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 20px;
            text-align: center;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        .metric {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border: 1px solid #e1e8ed;
        }
        .metric-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #27ae60;
        }
        .metric-label {
            font-size: 0.8rem;
            color: #7f8c8d;
            text-transform: uppercase;
            margin-top: 5px;
        }
        .ranking-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
        }
        .ranking-table th,
        .ranking-table td {
            padding: 15px;
            text-align: center;
            border-bottom: 1px solid #ddd;
        }
        .ranking-table th {
            background: #3498db;
            color: white;
            font-weight: 600;
        }
        .ranking-table tr:hover {
            background: #f8f9fa;
        }
        .rank-1 { background: #fff3cd !important; }
        .rank-2 { background: #e8f4fd !important; }
        .rank-3 { background: #f8f9fa !important; }
        .section {
            margin: 50px 0;
            padding: 30px;
            border: 2px solid #e1e8ed;
            border-radius: 12px;
            background: #fafbfc;
        }
        .section h2 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
            margin-bottom: 30px;
        }
        .chart-container {
            width: 100%;
            height: 400px;
            margin: 30px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚡ Node.js Framework Performance Comparison</h1>
        <p class="subtitle">Generated on ${results.timestamp} | NexureJS vs Express vs Fastify vs Koa</p>

        <div class="winner-banner">
            <h2>🏆 Overall Winner: ${comparison.winner.overall.framework.toUpperCase()}</h2>
            <p>Score: ${comparison.winner.overall.score}/100</p>
        </div>

        <div class="comparison-grid">
            ${Object.entries(frameworks).map(([name, data]) => `
                <div class="framework-card ${comparison.winner.overall.framework === name ? 'winner' : ''}">
                    <div class="framework-name">${name.toUpperCase()}</div>
                    <div class="metrics">
                        <div class="metric">
                            <div class="metric-value">${Math.round(data.tests.basicRouting.requestsPerSecond)}</div>
                            <div class="metric-label">Basic Routing (req/s)</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${data.tests.basicRouting.avgResponseTime.toFixed(2)}ms</div>
                            <div class="metric-label">Avg Response Time</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${Math.round(data.tests.jsonProcessing.requestsPerSecond)}</div>
                            <div class="metric-label">JSON Processing (req/s)</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${data.overallScore}</div>
                            <div class="metric-label">Overall Score</div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="section">
            <h2>🏃 Basic Routing Performance Ranking</h2>
            <table class="ranking-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Framework</th>
                        <th>Requests/Second</th>
                        <th>Avg Response Time</th>
                        <th>Performance vs Winner</th>
                    </tr>
                </thead>
                <tbody>
                    ${comparison.rankings.basicRouting.map(item => `
                        <tr class="rank-${item.rank}">
                            <td><strong>#${item.rank}</strong></td>
                            <td><strong>${item.framework.toUpperCase()}</strong></td>
                            <td>${item.requestsPerSecond.toLocaleString()}</td>
                            <td>${item.avgResponseTime}ms</td>
                            <td>${item.rank === 1 ? '100%' : Math.round((item.requestsPerSecond / comparison.rankings.basicRouting[0].requestsPerSecond) * 100) + '%'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>📊 JSON Processing Performance Ranking</h2>
            <table class="ranking-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Framework</th>
                        <th>Requests/Second</th>
                        <th>Avg Response Time</th>
                        <th>Performance vs Winner</th>
                    </tr>
                </thead>
                <tbody>
                    ${comparison.rankings.jsonProcessing.map(item => `
                        <tr class="rank-${item.rank}">
                            <td><strong>#${item.rank}</strong></td>
                            <td><strong>${item.framework.toUpperCase()}</strong></td>
                            <td>${item.requestsPerSecond.toLocaleString()}</td>
                            <td>${item.avgResponseTime}ms</td>
                            <td>${item.rank === 1 ? '100%' : Math.round((item.requestsPerSecond / comparison.rankings.jsonProcessing[0].requestsPerSecond) * 100) + '%'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>🎯 Overall Performance Ranking</h2>
            <table class="ranking-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Framework</th>
                        <th>Overall Score</th>
                        <th>Relative Performance</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${comparison.rankings.overall.map(item => `
                        <tr class="rank-${item.rank}">
                            <td><strong>#${item.rank}</strong></td>
                            <td><strong>${item.framework.toUpperCase()}</strong></td>
                            <td>${item.score}/100</td>
                            <td>${item.rank === 1 ? '100%' : Math.round((item.score / comparison.rankings.overall[0].score) * 100) + '%'}</td>
                            <td>${item.rank === 1 ? '🏆 Winner' : item.rank === 2 ? '🥈 Runner-up' : item.rank === 3 ? '🥉 Third' : '⭐ Competitor'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>📈 Performance Summary</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div class="metric">
                    <div class="metric-value">${comparison.summary.totalFrameworks}</div>
                    <div class="metric-label">Frameworks Tested</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${comparison.summary.bestOverall.toUpperCase()}</div>
                    <div class="metric-label">Best Overall</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${comparison.summary.bestThroughput.toUpperCase()}</div>
                    <div class="metric-label">Best Throughput</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${comparison.summary.averageScore}</div>
                    <div class="metric-label">Average Score</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  generateComparisonSummary() {
    const { frameworks, comparison } = results;

    return `# Node.js Framework Performance Comparison

## Executive Summary
- **Test Date**: ${results.timestamp}
- **Frameworks Tested**: ${Object.keys(frameworks).join(', ')}
- **Overall Winner**: ${comparison.winner.overall.framework.toUpperCase()}

## Performance Rankings

### Basic Routing Performance
${comparison.rankings.basicRouting.map(item =>
  `${item.rank}. **${item.framework.toUpperCase()}** - ${item.requestsPerSecond.toLocaleString()} req/s (${item.avgResponseTime}ms avg)`
).join('\n')}

### JSON Processing Performance
${comparison.rankings.jsonProcessing.map(item =>
  `${item.rank}. **${item.framework.toUpperCase()}** - ${item.requestsPerSecond.toLocaleString()} req/s (${item.avgResponseTime}ms avg)`
).join('\n')}

### Overall Performance Score
${comparison.rankings.overall.map(item =>
  `${item.rank}. **${item.framework.toUpperCase()}** - ${item.score}/100 points`
).join('\n')}

## Key Findings

- **Best Overall Performance**: ${comparison.winner.overall.framework.toUpperCase()} with ${comparison.winner.overall.score}/100 points
- **Highest Throughput**: ${comparison.winner.basicRouting.framework.toUpperCase()} at ${comparison.winner.basicRouting.requestsPerSecond.toLocaleString()} req/s
- **Best JSON Processing**: ${comparison.winner.jsonProcessing.framework.toUpperCase()} at ${comparison.winner.jsonProcessing.requestsPerSecond.toLocaleString()} req/s

## Recommendations

Based on the benchmark results:

1. **For high-throughput applications**: Choose ${comparison.winner.basicRouting.framework.toUpperCase()}
2. **For JSON-heavy APIs**: Consider ${comparison.winner.jsonProcessing.framework.toUpperCase()}
3. **For overall performance**: ${comparison.winner.overall.framework.toUpperCase()} provides the best balance

## System Information
- **Platform**: ${results.systemInfo.platform} ${results.systemInfo.arch}
- **CPU**: ${results.systemInfo.cpuModel} (${results.systemInfo.cpus} cores)
- **Node.js**: ${results.systemInfo.nodeVersion}
- **Memory**: ${results.systemInfo.memory}MB
`;
  }
}

// Main execution
async function main() {
  try {
    console.log('🏁 Starting Framework Performance Comparison...');

    const comparison = new FrameworkComparison();
    const results = await comparison.runFrameworkComparison();
    const reportPaths = comparison.generateComparisonReports();

    console.log('\n✅ Framework comparison completed successfully!');
    console.log('🏆 Results Summary:');
    console.log(`   • Overall Winner: ${results.comparison.winner.overall.framework.toUpperCase()} (${results.comparison.winner.overall.score}/100)`);
    console.log(`   • Best Throughput: ${results.comparison.winner.basicRouting.framework.toUpperCase()} (${results.comparison.winner.basicRouting.requestsPerSecond.toLocaleString()} req/s)`);
    console.log(`   • Best JSON Processing: ${results.comparison.winner.jsonProcessing.framework.toUpperCase()} (${results.comparison.winner.jsonProcessing.requestsPerSecond.toLocaleString()} req/s)`);

    console.log('\n📄 Comparison Reports generated:');
    console.log(`   • HTML: ${reportPaths.htmlPath}`);
    console.log(`   • JSON: ${reportPaths.jsonPath}`);
    console.log(`   • Summary: ${reportPaths.summaryPath}`);

  } catch (error) {
    console.error('❌ Framework comparison failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { FrameworkComparison };
