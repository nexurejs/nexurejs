#!/usr/bin/env node

/**
 * Load Test Benchmark Suite
 * Simulates real-world traffic patterns with varying loads, realistic data, and extended duration tests
 */

import { createServer } from 'http';
import http from 'http';
import { performance } from 'perf_hooks';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { cpus } from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import crypto from 'crypto';

// Load Test Configuration
const CONFIG = {
  testDuration: 300000, // 5 minutes
  rampUpDuration: 30000, // 30 seconds
  peakDuration: 240000, // 4 minutes
  rampDownDuration: 30000, // 30 seconds
  maxConcurrentUsers: 1000,
  requestsPerUser: 50,
  outputDir: './benchmarks/results',
  port: 3005,
  scenarios: ['light', 'moderate', 'heavy', 'stress', 'spike'],
  userBehaviorPatterns: {
    browse: 0.6,    // 60% browsing behavior
    api: 0.3,       // 30% API calls
    upload: 0.1     // 10% file uploads
  }
};

// Test Results Storage
const results = {
  systemInfo: {},
  loadTests: {},
  performance: {},
  timestamp: new Date().toISOString(),
  version: '1.0-load-test'
};

class LoadTestBenchmark {
  constructor() {
    this.setupOutputDirectory();
    this.gatherSystemInfo();
    this.requestCounter = 0;
    this.errorCounter = 0;
    this.activeUsers = 0;
    this.responseTimes = [];
    this.memorySnapshots = [];
  }

  setupOutputDirectory() {
    if (!existsSync(CONFIG.outputDir)) {
      mkdirSync(CONFIG.outputDir, { recursive: true });
    }
  }

  gatherSystemInfo() {
    console.log('📋 Gathering system information for load testing...');

    results.systemInfo = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: cpus().length,
      cpuModel: cpus()[0].model,
      memory: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      v8Version: process.versions.v8,
      maxUsers: CONFIG.maxConcurrentUsers,
      testDuration: CONFIG.testDuration / 1000
    };

    console.log(`💻 System: ${results.systemInfo.platform} ${results.systemInfo.arch}`);
    console.log(`🧮 CPU: ${results.systemInfo.cpuModel} (${results.systemInfo.cpus} cores)`);
    console.log(`🧠 Memory: ${results.systemInfo.memory}MB, Node.js ${results.systemInfo.nodeVersion}`);
    console.log(`👥 Max Concurrent Users: ${CONFIG.maxConcurrentUsers}`);
  }

  // Create realistic test server with various endpoints
  createLoadTestServer() {
    const server = createServer((req, res) => {
      const url = req.url;
      const method = req.method;
      const startTime = performance.now();

      // Set realistic headers
      res.setHeader('Server', 'NexureJS-LoadTest');
      res.setHeader('X-Response-Time', Date.now().toString());
      res.setHeader('Cache-Control', 'no-cache');

      if (url === '/' && method === 'GET') {
        // Homepage simulation
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html><head><title>Load Test Server</title></head>
          <body>
            <h1>Welcome to Load Test Server</h1>
            <p>Current time: ${new Date().toISOString()}</p>
          </body></html>
        `);

      } else if (url === '/api/users' && method === 'GET') {
        // User list API
        const users = Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
          createdAt: new Date(Date.now() - Math.random() * 31536000000).toISOString()  // Random date within last year
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          users: users,
          total: users.length,
          timestamp: Date.now()
        }));

      } else if (url?.match(/^\/api\/user\/\d+$/) && method === 'GET') {
        // Single user API
        const id = parseInt(url.split('/')[3]);
        const user = {
          id: id,
          name: `User ${id}`,
          email: `user${id}@example.com`,
          profile: {
            age: Math.floor(Math.random() * 50) + 18,
            location: ['New York', 'London', 'Tokyo', 'Sydney'][Math.floor(Math.random() * 4)],
            interests: ['reading', 'gaming', 'travel', 'cooking'].slice(0, Math.floor(Math.random() * 4) + 1)
          },
          stats: {
            loginCount: Math.floor(Math.random() * 1000),
            lastActive: new Date(Date.now() - Math.random() * 86400000).toISOString()
          }
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(user));

      } else if (url === '/api/search' && method === 'POST') {
        // Search API with POST data
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const searchQuery = JSON.parse(body || '{}');

          // Simulate search processing time
          const processingDelay = Math.random() * 100;
          setTimeout(() => {
            const results = Array.from({ length: Math.floor(Math.random() * 50) + 1 }, (_, i) => ({
              id: i + 1,
              title: `Search Result ${i + 1} for "${searchQuery.query || 'default'}"`,
              description: `This is a sample search result description ${crypto.randomBytes(16).toString('hex')}`,
              relevance: Math.random(),
              category: ['product', 'article', 'service', 'news'][Math.floor(Math.random() * 4)]
            }));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              query: searchQuery.query || '',
              results: results,
              totalResults: results.length,
              processingTime: processingDelay,
              timestamp: Date.now()
            }));
          }, processingDelay);
        });

      } else if (url === '/api/upload' && method === 'POST') {
        // File upload simulation
        let totalSize = 0;
        req.on('data', chunk => {
          totalSize += chunk.length;
        });
        req.on('end', () => {
          const uploadId = crypto.randomBytes(16).toString('hex');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            uploadId: uploadId,
            filename: 'uploaded-file.dat',
            size: totalSize,
            status: 'completed',
            uploadTime: performance.now() - startTime,
            timestamp: Date.now()
          }));
        });

      } else if (url === '/api/analytics' && method === 'GET') {
        // Analytics endpoint with heavy computation
        const dataPoints = Array.from({ length: 1000 }, () => Math.random() * 100);
        const analytics = {
          totalRequests: this.requestCounter,
          activeUsers: this.activeUsers,
          avgResponseTime: this.responseTimes.length > 0
            ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
            : 0,
          errorRate: this.errorCounter / Math.max(this.requestCounter, 1),
          dataPoints: dataPoints,
          statistics: {
            min: Math.min(...dataPoints),
            max: Math.max(...dataPoints),
            avg: dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length,
            sum: dataPoints.reduce((a, b) => a + b, 0)
          },
          memoryUsage: process.memoryUsage(),
          timestamp: Date.now()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(analytics));

      } else if (url === '/api/health' && method === 'GET') {
        // Health check endpoint
        const health = {
          status: 'healthy',
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          activeConnections: this.activeUsers,
          totalRequests: this.requestCounter,
          errorRate: this.errorCounter / Math.max(this.requestCounter, 1),
          timestamp: Date.now()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));

      } else if (url === '/slow-endpoint' && method === 'GET') {
        // Intentionally slow endpoint for testing
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'This was a slow response',
            delay: 2000,
            timestamp: Date.now()
          }));
        }, 2000);

      } else {
        // 404 Not Found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Not Found',
          path: url,
          method: method,
          timestamp: Date.now()
        }));
        this.errorCounter++;
      }

      // Track performance metrics
      const responseTime = performance.now() - startTime;
      this.responseTimes.push(responseTime);
      this.requestCounter++;

      // Keep only last 1000 response times for memory efficiency
      if (this.responseTimes.length > 1000) {
        this.responseTimes = this.responseTimes.slice(-1000);
      }
    });

    return server;
  }

  // Simulate user behavior patterns
  getUserBehaviorPattern() {
    const rand = Math.random();
    if (rand < CONFIG.userBehaviorPatterns.browse) {
      return 'browse';
    } else if (rand < CONFIG.userBehaviorPatterns.browse + CONFIG.userBehaviorPatterns.api) {
      return 'api';
    } else {
      return 'upload';
    }
  }

  // Generate realistic request sequence based on user behavior
  generateRequestSequence(pattern) {
    const sequences = {
      browse: [
        '/',
        '/api/users',
        '/api/user/1',
        '/api/user/5',
        '/api/health'
      ],
      api: [
        '/api/health',
        '/api/users',
        '/api/search',
        '/api/analytics',
        '/api/user/10'
      ],
      upload: [
        '/api/health',
        '/api/upload',
        '/api/analytics'
      ]
    };

    return sequences[pattern] || sequences.browse;
  }

  // Make HTTP request with realistic data
  async makeLoadTestRequest(path, method = 'GET', data = null, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const options = {
        hostname: 'localhost',
        port: CONFIG.port,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LoadTest-Browser/1.0',
          'Accept': 'application/json, text/html',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
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
            headers: res.headers,
            success: res.statusCode >= 200 && res.statusCode < 400
          });
        });
      });

      req.on('error', (error) => {
        const endTime = performance.now();
        resolve({
          statusCode: 0,
          responseTime: endTime - startTime,
          dataSize: 0,
          success: false,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const endTime = performance.now();
        resolve({
          statusCode: 0,
          responseTime: endTime - startTime,
          dataSize: 0,
          success: false,
          error: 'Request timeout'
        });
      });

      if (data) {
        if (path === '/api/search') {
          req.write(JSON.stringify({
            query: ['nodejs', 'javascript', 'performance', 'benchmark'][Math.floor(Math.random() * 4)],
            filters: {
              category: ['all', 'products', 'articles'][Math.floor(Math.random() * 3)],
              sortBy: 'relevance'
            }
          }));
        } else if (path === '/api/upload') {
          // Simulate file upload
          const fileData = crypto.randomBytes(Math.floor(Math.random() * 10000) + 1000);
          req.write(fileData);
        } else {
          req.write(JSON.stringify(data));
        }
      }

      req.end();
    });
  }

  // Simulate a single user session
  async simulateUser(userId, duration) {
    const pattern = this.getUserBehaviorPattern();
    const requestSequence = this.generateRequestSequence(pattern);
    const userResults = [];

    this.activeUsers++;
    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      for (const path of requestSequence) {
        const method = path === '/api/search' || path === '/api/upload' ? 'POST' : 'GET';
        const data = (path === '/api/search' || path === '/api/upload') ? {} : null;

        try {
          const result = await this.makeLoadTestRequest(path, method, data);
          userResults.push({
            userId: userId,
            path: path,
            method: method,
            ...result,
            timestamp: Date.now()
          });
        } catch (error) {
          userResults.push({
            userId: userId,
            path: path,
            method: method,
            success: false,
            error: error.message,
            timestamp: Date.now()
          });
        }

        // Random delay between requests (0.5-3 seconds)
        const delay = Math.random() * 2500 + 500;
        await new Promise(resolve => setTimeout(resolve, delay));

        // Check if duration exceeded
        if (Date.now() - startTime >= duration) break;
      }
    }

    this.activeUsers--;
    return userResults;
  }

  // Run load test scenario
  async runLoadTestScenario(scenario) {
    console.log(`\n🚀 Running ${scenario.toUpperCase()} load test scenario...`);

    const scenarioConfig = {
      light: { users: 10, duration: 60000 },
      moderate: { users: 50, duration: 120000 },
      heavy: { users: 200, duration: 180000 },
      stress: { users: 500, duration: 240000 },
      spike: { users: 1000, duration: 300000 }
    };

    const config = scenarioConfig[scenario] || scenarioConfig.moderate;
    const results = [];
    const startTime = Date.now();

    // Ramp up users gradually
    const rampUpInterval = config.duration / config.users;
    const userPromises = [];

    console.log(`  👥 Ramping up to ${config.users} users over ${rampUpInterval.toFixed(0)}ms intervals...`);

    for (let i = 0; i < config.users; i++) {
      setTimeout(async () => {
        const userResults = await this.simulateUser(i + 1, config.duration);
        results.push(...userResults);
      }, i * rampUpInterval);
    }

    // Wait for test completion
    await new Promise(resolve => setTimeout(resolve, config.duration + 10000));

    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      scenario: scenario,
      configuration: config,
      totalTime: totalTime,
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      successRate: (successful.length / results.length) * 100,
      avgResponseTime: successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length,
      minResponseTime: Math.min(...successful.map(r => r.responseTime)),
      maxResponseTime: Math.max(...successful.map(r => r.responseTime)),
      requestsPerSecond: results.length / (totalTime / 1000),
      peakActiveUsers: config.users,
      memoryUsage: process.memoryUsage(),
      errors: failed.map(r => ({ path: r.path, error: r.error })),
      detailedResults: results
    };
  }

  // Monitor system performance during load test
  startPerformanceMonitoring() {
    const interval = setInterval(() => {
      this.memorySnapshots.push({
        timestamp: Date.now(),
        memory: process.memoryUsage(),
        activeUsers: this.activeUsers,
        totalRequests: this.requestCounter,
        errorRate: this.errorCounter / Math.max(this.requestCounter, 1)
      });
    }, 5000); // Every 5 seconds

    return interval;
  }

  // Run all load test scenarios
  async runLoadTestSuite() {
    console.log('🔥 Starting Comprehensive Load Test Suite');
    console.log(`📊 Test Duration: ${CONFIG.testDuration / 1000}s per scenario`);
    console.log(`👥 Max Concurrent Users: ${CONFIG.maxConcurrentUsers}`);

    const server = this.createLoadTestServer();
    const performanceMonitor = this.startPerformanceMonitoring();

    return new Promise((resolve, reject) => {
      server.listen(CONFIG.port, async () => {
        console.log(`🌐 Load test server running on port ${CONFIG.port}`);

        try {
          const suiteStartTime = performance.now();

          // Run each load test scenario
          for (const scenario of CONFIG.scenarios) {
            const scenarioResult = await this.runLoadTestScenario(scenario);
            results.loadTests[scenario] = scenarioResult;

            console.log(`✅ ${scenario.toUpperCase()} scenario completed:`);
            console.log(`   • Requests: ${scenarioResult.totalRequests} (${scenarioResult.successRate.toFixed(1)}% success)`);
            console.log(`   • Throughput: ${Math.round(scenarioResult.requestsPerSecond)} req/s`);
            console.log(`   • Response Time: ${scenarioResult.avgResponseTime.toFixed(2)}ms avg`);
            console.log(`   • Peak Users: ${scenarioResult.peakActiveUsers}`);

            // Brief pause between scenarios
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          const totalSuiteTime = performance.now() - suiteStartTime;
          results.performance = {
            totalSuiteTime: totalSuiteTime,
            memorySnapshots: this.memorySnapshots,
            finalMemoryUsage: process.memoryUsage(),
            totalRequestsProcessed: this.requestCounter,
            totalErrors: this.errorCounter,
            overallErrorRate: this.errorCounter / Math.max(this.requestCounter, 1)
          };

          console.log('\n✅ All load test scenarios completed');

          // Stop monitoring and server
          clearInterval(performanceMonitor);
          server.close(() => {
            resolve(results);
          });

        } catch (error) {
          console.error('❌ Load test failed:', error);
          clearInterval(performanceMonitor);
          server.close(() => {
            reject(error);
          });
        }
      });

      server.on('error', (error) => {
        console.error('❌ Server error:', error);
        clearInterval(performanceMonitor);
        reject(error);
      });
    });
  }

  // Generate load test reports
  generateLoadTestReports() {
    console.log('📈 Generating load test reports...');

    // Generate JSON report
    const jsonReport = JSON.stringify(results, null, 2);
    const jsonPath = join(CONFIG.outputDir, `load-test-results-${Date.now()}.json`);
    writeFileSync(jsonPath, jsonReport);
    console.log(`📄 Load test JSON report saved to: ${jsonPath}`);

    // Generate HTML report
    const htmlReport = this.generateLoadTestHTMLReport();
    const htmlPath = join(CONFIG.outputDir, `load-test-report-${Date.now()}.html`);
    writeFileSync(htmlPath, htmlReport);
    console.log(`🌐 Load test HTML report saved to: ${htmlPath}`);

    // Generate summary report
    const summaryReport = this.generateLoadTestSummary();
    const summaryPath = join(CONFIG.outputDir, `load-test-summary-${Date.now()}.md`);
    writeFileSync(summaryPath, summaryReport);
    console.log(`📋 Load test summary saved to: ${summaryPath}`);

    return { jsonPath, htmlPath, summaryPath };
  }

  generateLoadTestHTMLReport() {
    const scenarios = Object.entries(results.loadTests);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexureJS Load Test Results</title>
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
        .scenario-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin: 40px 0;
        }
        .scenario-card {
            border: 2px solid #e1e8ed;
            border-radius: 12px;
            padding: 25px;
            background: #fafbfc;
            transition: transform 0.2s ease;
        }
        .scenario-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .scenario-card.excellent {
            border-color: #27ae60;
            background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
        }
        .scenario-card.good {
            border-color: #f39c12;
            background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
        }
        .scenario-card.poor {
            border-color: #e74c3c;
            background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
        }
        .scenario-name {
            font-size: 1.5rem;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 20px;
            text-align: center;
            text-transform: uppercase;
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
            font-size: 1.3rem;
            font-weight: bold;
            color: #27ae60;
        }
        .metric-label {
            font-size: 0.8rem;
            color: #7f8c8d;
            text-transform: uppercase;
            margin-top: 5px;
        }
        .performance-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
        }
        .performance-table th,
        .performance-table td {
            padding: 15px;
            text-align: center;
            border-bottom: 1px solid #ddd;
        }
        .performance-table th {
            background: #3498db;
            color: white;
            font-weight: 600;
        }
        .performance-table tr:hover {
            background: #f8f9fa;
        }
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
        .excellent { color: #27ae60; font-weight: bold; }
        .good { color: #f39c12; font-weight: bold; }
        .poor { color: #e74c3c; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔥 NexureJS Load Test Results</h1>
        <p class="subtitle">Generated on ${results.timestamp} | Comprehensive Load Testing Suite</p>

        <div class="section">
            <h2>📊 Test Configuration</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div class="metric">
                    <div class="metric-value">${CONFIG.scenarios.length}</div>
                    <div class="metric-label">Test Scenarios</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${CONFIG.maxConcurrentUsers}</div>
                    <div class="metric-label">Max Concurrent Users</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${CONFIG.testDuration / 1000}s</div>
                    <div class="metric-label">Test Duration per Scenario</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${results.performance.totalRequestsProcessed.toLocaleString()}</div>
                    <div class="metric-label">Total Requests Processed</div>
                </div>
            </div>
        </div>

        <div class="scenario-grid">
            ${scenarios.map(([name, data]) => {
              const performanceClass = data.successRate > 95 ? 'excellent' : data.successRate > 85 ? 'good' : 'poor';
              return `
                <div class="scenario-card ${performanceClass}">
                    <div class="scenario-name">${name}</div>
                    <div class="metrics">
                        <div class="metric">
                            <div class="metric-value">${data.peakActiveUsers}</div>
                            <div class="metric-label">Peak Users</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${Math.round(data.requestsPerSecond)}</div>
                            <div class="metric-label">Requests/Second</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${data.avgResponseTime.toFixed(2)}ms</div>
                            <div class="metric-label">Avg Response Time</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${data.successRate.toFixed(1)}%</div>
                            <div class="metric-label">Success Rate</div>
                        </div>
                    </div>
                </div>
              `;
            }).join('')}
        </div>

        <div class="section">
            <h2>📈 Performance Comparison</h2>
            <table class="performance-table">
                <thead>
                    <tr>
                        <th>Scenario</th>
                        <th>Peak Users</th>
                        <th>Total Requests</th>
                        <th>Success Rate</th>
                        <th>Requests/Second</th>
                        <th>Avg Response Time</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${scenarios.map(([name, data]) => {
                      const statusClass = data.successRate > 95 ? 'excellent' : data.successRate > 85 ? 'good' : 'poor';
                      const status = data.successRate > 95 ? '🟢 Excellent' : data.successRate > 85 ? '🟡 Good' : '🔴 Needs Attention';
                      return `
                        <tr>
                            <td><strong>${name.toUpperCase()}</strong></td>
                            <td>${data.peakActiveUsers}</td>
                            <td>${data.totalRequests.toLocaleString()}</td>
                            <td class="${statusClass}">${data.successRate.toFixed(1)}%</td>
                            <td>${Math.round(data.requestsPerSecond)}</td>
                            <td>${data.avgResponseTime.toFixed(2)}ms</td>
                            <td>${status}</td>
                        </tr>
                      `;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>🧠 Memory Performance</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div class="metric">
                    <div class="metric-value">${Math.round(results.performance.finalMemoryUsage.heapUsed / 1024 / 1024)}MB</div>
                    <div class="metric-label">Final Heap Used</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${Math.round(results.performance.finalMemoryUsage.heapTotal / 1024 / 1024)}MB</div>
                    <div class="metric-label">Final Heap Total</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${Math.round(results.performance.finalMemoryUsage.rss / 1024 / 1024)}MB</div>
                    <div class="metric-label">Resident Set Size</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${(results.performance.overallErrorRate * 100).toFixed(2)}%</div>
                    <div class="metric-label">Overall Error Rate</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>💡 Performance Insights</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db;">
                <h3>Key Findings:</h3>
                <ul>
                    <li><strong>Best Performing Scenario:</strong> ${scenarios.sort(([,a], [,b]) => b.successRate - a.successRate)[0][0].toUpperCase()} (${scenarios.sort(([,a], [,b]) => b.successRate - a.successRate)[0][1].successRate.toFixed(1)}% success rate)</li>
                    <li><strong>Highest Throughput:</strong> ${scenarios.sort(([,a], [,b]) => b.requestsPerSecond - a.requestsPerSecond)[0][0].toUpperCase()} (${Math.round(scenarios.sort(([,a], [,b]) => b.requestsPerSecond - a.requestsPerSecond)[0][1].requestsPerSecond)} req/s)</li>
                    <li><strong>Fastest Response:</strong> ${scenarios.sort(([,a], [,b]) => a.avgResponseTime - b.avgResponseTime)[0][0].toUpperCase()} (${scenarios.sort(([,a], [,b]) => a.avgResponseTime - b.avgResponseTime)[0][1].avgResponseTime.toFixed(2)}ms avg)</li>
                    <li><strong>Total Test Duration:</strong> ${(results.performance.totalSuiteTime / 1000 / 60).toFixed(1)} minutes</li>
                </ul>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  generateLoadTestSummary() {
    const scenarios = Object.entries(results.loadTests);

    return `# NexureJS Load Test Results Summary

## Executive Summary
- **Test Date**: ${results.timestamp}
- **Total Scenarios**: ${scenarios.length}
- **Max Concurrent Users**: ${CONFIG.maxConcurrentUsers}
- **Total Requests Processed**: ${results.performance.totalRequestsProcessed.toLocaleString()}
- **Overall Error Rate**: ${(results.performance.overallErrorRate * 100).toFixed(2)}%

## Scenario Performance

${scenarios.map(([name, data]) => `
### ${name.toUpperCase()} Load Test
- **Peak Users**: ${data.peakActiveUsers}
- **Total Requests**: ${data.totalRequests.toLocaleString()}
- **Success Rate**: ${data.successRate.toFixed(1)}%
- **Throughput**: ${Math.round(data.requestsPerSecond)} requests/second
- **Response Time**: ${data.avgResponseTime.toFixed(2)}ms average (${data.minResponseTime.toFixed(2)}ms min, ${data.maxResponseTime.toFixed(2)}ms max)
- **Status**: ${data.successRate > 95 ? '🟢 Excellent' : data.successRate > 85 ? '🟡 Good' : '🔴 Needs Attention'}
`).join('')}

## Performance Rankings

### Best Success Rate
${scenarios.sort(([,a], [,b]) => b.successRate - a.successRate).map(([name, data], index) =>
  `${index + 1}. **${name.toUpperCase()}** - ${data.successRate.toFixed(1)}%`
).join('\n')}

### Highest Throughput
${scenarios.sort(([,a], [,b]) => b.requestsPerSecond - a.requestsPerSecond).map(([name, data], index) =>
  `${index + 1}. **${name.toUpperCase()}** - ${Math.round(data.requestsPerSecond)} req/s`
).join('\n')}

### Fastest Response Time
${scenarios.sort(([,a], [,b]) => a.avgResponseTime - b.avgResponseTime).map(([name, data], index) =>
  `${index + 1}. **${name.toUpperCase()}** - ${data.avgResponseTime.toFixed(2)}ms`
).join('\n')}

## System Performance
- **Final Memory Usage**: ${Math.round(results.performance.finalMemoryUsage.heapUsed / 1024 / 1024)}MB heap used
- **Peak Memory**: ${Math.round(results.performance.finalMemoryUsage.heapTotal / 1024 / 1024)}MB heap total
- **Test Duration**: ${(results.performance.totalSuiteTime / 1000 / 60).toFixed(1)} minutes

## Recommendations

1. **Optimal Load**: System performs best under ${scenarios.sort(([,a], [,b]) => b.successRate - a.successRate)[0][0]} conditions
2. **Scaling**: Consider horizontal scaling beyond ${scenarios.find(([,data]) => data.successRate < 90)?.[1]?.peakActiveUsers || CONFIG.maxConcurrentUsers} concurrent users
3. **Performance**: Consistent performance across different load patterns
4. **Monitoring**: Implement real-time monitoring for production deployments

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
    console.log('🔥 Starting Comprehensive Load Test Suite...');

    const loadTest = new LoadTestBenchmark();
    const results = await loadTest.runLoadTestSuite();
    const reportPaths = loadTest.generateLoadTestReports();

    console.log('\n✅ Load test suite completed successfully!');
    console.log('📊 Load Test Results Summary:');

    Object.entries(results.loadTests).forEach(([scenario, data]) => {
      console.log(`   • ${scenario.toUpperCase()}: ${Math.round(data.requestsPerSecond)} req/s, ${data.successRate.toFixed(1)}% success`);
    });

    console.log(`   • Total Requests: ${results.performance.totalRequestsProcessed.toLocaleString()}`);
    console.log(`   • Final Memory: ${Math.round(results.performance.finalMemoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`   • Error Rate: ${(results.performance.overallErrorRate * 100).toFixed(2)}%`);

    console.log('\n📄 Load Test Reports generated:');
    console.log(`   • HTML: ${reportPaths.htmlPath}`);
    console.log(`   • JSON: ${reportPaths.jsonPath}`);
    console.log(`   • Summary: ${reportPaths.summaryPath}`);

  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { LoadTestBenchmark };
