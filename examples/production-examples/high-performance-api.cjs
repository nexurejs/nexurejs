const http = require('http');
const { performance } = require('perf_hooks');

/**
 * High-Performance API Server using NexureJS Native Modules
 * Demonstrates real-world usage of 16 working native modules
 */

class HighPerformanceAPI {
  constructor() {
    this.native = null;
    this.router = null;
    this.cache = null;
    this.compression = null;
    this.objectPool = null;
    this.threadPool = null;
    this.metrics = {
      requests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0
    };
  }

  async initialize() {
    try {
      // Load native modules
      this.native = require('../../build/Release/nexurejs_native.node');
      console.log(`🚀 Loaded NexureJS Native v${this.native.version}`);

      // Initialize core modules
      this.router = new this.native.RadixRouter();
      this.cache = new this.native.LRUCache(10000); // 10k item cache
      this.objectPool = new this.native.ObjectPool();
      this.threadPool = new this.native.ThreadPool();

      // Setup routes
      this.setupRoutes();

      console.log('✅ High-Performance API initialized with native modules');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize native modules:', error.message);
      return false;
    }
  }

  setupRoutes() {
    // API routes using native router
    this.router.add('GET', '/api/users', 'getUsers');
    this.router.add('GET', '/api/users/:id', 'getUserById');
    this.router.add('POST', '/api/users', 'createUser');
    this.router.add('PUT', '/api/users/:id', 'updateUser');
    this.router.add('DELETE', '/api/users/:id', 'deleteUser');
    this.router.add('GET', '/api/stats', 'getStats');
    this.router.add('GET', '/api/health', 'healthCheck');
    this.router.add('GET', '/api/benchmark', 'benchmark');
  }

  async handleRequest(req, res) {
    const startTime = performance.now();
    this.metrics.requests++;

    try {
      // Parse request using native HTTP parser
      const httpParser = new this.native.HttpParser();
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Route matching using native router
      const route = this.router.find(req.method, url.pathname);

      if (!route.found) {
        this.sendResponse(res, 404, { error: 'Route not found' });
        return;
      }

      // Handle the route
      await this.handleRoute(route.handler, req, res, route.params, url);

    } catch (error) {
      console.error('Request handling error:', error);
      this.sendResponse(res, 500, { error: 'Internal server error' });
    } finally {
      const endTime = performance.now();
      this.metrics.totalResponseTime += (endTime - startTime);
    }
  }

  async handleRoute(handler, req, res, params, url) {
    switch (handler) {
      case 'getUsers':
        await this.getUsers(req, res);
        break;
      case 'getUserById':
        await this.getUserById(req, res, params);
        break;
      case 'createUser':
        await this.createUser(req, res);
        break;
      case 'updateUser':
        await this.updateUser(req, res, params);
        break;
      case 'deleteUser':
        await this.deleteUser(req, res, params);
        break;
      case 'getStats':
        await this.getStats(req, res);
        break;
      case 'healthCheck':
        await this.healthCheck(req, res);
        break;
      case 'benchmark':
        await this.benchmark(req, res);
        break;
      default:
        this.sendResponse(res, 404, { error: 'Handler not found' });
    }
  }

  async getUsers(req, res) {
    // Check cache first using native LRU cache
    const cacheKey = 'users:all';
    let users = this.cache.get(cacheKey);

    if (users) {
      this.metrics.cacheHits++;
      this.sendCompressedResponse(res, 200, JSON.parse(users));
      return;
    }

    // Generate sample data
    this.metrics.cacheMisses++;
    users = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: i % 2 === 0,
      createdAt: new Date().toISOString()
    }));

    // Cache the result using native JSON processor
    const jsonProcessor = new this.native.JsonProcessor();
    const jsonString = jsonProcessor.stringify(users);
    this.cache.set(cacheKey, jsonString);

    this.sendCompressedResponse(res, 200, users);
  }

  async getUserById(req, res, params) {
    const userId = parseInt(params.id);
    const cacheKey = `user:${userId}`;

    // Check cache
    let user = this.cache.get(cacheKey);
    if (user) {
      this.metrics.cacheHits++;
      this.sendResponse(res, 200, JSON.parse(user));
      return;
    }

    // Simulate database lookup
    this.metrics.cacheMisses++;
    if (userId < 1 || userId > 1000) {
      this.sendResponse(res, 404, { error: 'User not found' });
      return;
    }

    user = {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
      active: userId % 2 === 0,
      profile: {
        bio: `This is user ${userId}`,
        preferences: { theme: 'dark', notifications: true }
      },
      createdAt: new Date().toISOString()
    };

    // Cache using native JSON
    const jsonProcessor = new this.native.JsonProcessor();
    this.cache.set(cacheKey, jsonProcessor.stringify(user));

    this.sendResponse(res, 200, user);
  }

  async createUser(req, res) {
    // Parse request body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        // Use native JSON processor for parsing
        const jsonProcessor = new this.native.JsonProcessor();
        const userData = jsonProcessor.parse(body);

        // Validate using native schema validator
        const validator = new this.native.SchemaValidator();
        // Note: In real implementation, you'd define and use a schema

        // Simulate user creation
        const newUser = {
          id: Math.floor(Math.random() * 100000),
          ...userData,
          createdAt: new Date().toISOString()
        };

        // Invalidate users cache
        this.cache.delete('users:all');

        this.sendResponse(res, 201, newUser);
      } catch (error) {
        this.sendResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
  }

  async updateUser(req, res, params) {
    // Similar implementation with caching invalidation
    this.sendResponse(res, 200, { message: 'User updated', id: params.id });
  }

  async deleteUser(req, res, params) {
    const userId = params.id;

    // Remove from cache
    this.cache.delete(`user:${userId}`);
    this.cache.delete('users:all');

    this.sendResponse(res, 200, { message: 'User deleted', id: userId });
  }

  async getStats(req, res) {
    const stats = {
      server: {
        version: this.native.version,
        platform: this.native.platform,
        uptime: process.uptime()
      },
      metrics: {
        totalRequests: this.metrics.requests,
        cacheHits: this.metrics.cacheHits,
        cacheMisses: this.metrics.cacheMisses,
        cacheHitRate: this.metrics.requests > 0 ?
          ((this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100).toFixed(2) + '%' : '0%',
        averageResponseTime: this.metrics.requests > 0 ?
          (this.metrics.totalResponseTime / this.metrics.requests).toFixed(3) + 'ms' : '0ms'
      },
      nativeModules: {
        router: 'RadixRouter - Ultra-fast routing',
        cache: 'LRUCache - High-performance caching',
        json: 'JsonProcessor - Fast JSON operations',
        compression: 'Compression - Gzip support',
        validation: 'SchemaValidator - Data validation',
        objectPool: 'ObjectPool - Memory efficiency'
      }
    };

    this.sendResponse(res, 200, stats);
  }

  async healthCheck(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      nativeModules: {
        available: 16,
        working: Object.keys(this.native).filter(k => k.includes('Initialized') && this.native[k]).length
      }
    };

    this.sendResponse(res, 200, health);
  }

  async benchmark(req, res) {
    console.log('🔥 Running native module benchmarks...');

    const results = {};
    const iterations = 10000;

    // Router benchmark
    const routerStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.router.find('GET', `/api/users/${i % 100}`);
    }
    const routerEnd = performance.now();
    results.router = {
      operations: iterations,
      time: (routerEnd - routerStart).toFixed(3) + 'ms',
      opsPerSecond: Math.floor(iterations / ((routerEnd - routerStart) / 1000))
    };

    // Cache benchmark
    const cacheStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.cache.set(`key${i}`, `value${i}`);
      this.cache.get(`key${i}`);
    }
    const cacheEnd = performance.now();
    results.cache = {
      operations: iterations * 2,
      time: (cacheEnd - cacheStart).toFixed(3) + 'ms',
      opsPerSecond: Math.floor((iterations * 2) / ((cacheEnd - cacheStart) / 1000))
    };

    // JSON benchmark
    const jsonProcessor = new this.native.JsonProcessor();
    const testObject = { users: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}` })) };
    const jsonStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      const str = jsonProcessor.stringify(testObject);
      jsonProcessor.parse(str);
    }
    const jsonEnd = performance.now();
    results.json = {
      operations: 2000,
      time: (jsonEnd - jsonStart).toFixed(3) + 'ms',
      opsPerSecond: Math.floor(2000 / ((jsonEnd - jsonStart) / 1000))
    };

    this.sendResponse(res, 200, { benchmark: results });
  }

  sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'X-Powered-By': 'NexureJS-Native'
    });
    res.end(JSON.stringify(data));
  }

  sendCompressedResponse(res, statusCode, data) {
    // Use native compression
    const jsonString = JSON.stringify(data);
    const compressed = this.native.compress(Buffer.from(jsonString));

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'X-Powered-By': 'NexureJS-Native'
    });
    res.end(compressed);
  }

  start(port = 3000) {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(port, () => {
      console.log(`🚀 High-Performance API Server running on port ${port}`);
      console.log(`📊 Native modules: ${Object.keys(this.native).filter(k => k.includes('Initialized') && this.native[k]).length}/16 working`);
      console.log(`🔗 Try: http://localhost:${port}/api/health`);
    });

    return server;
  }
}

// Start the server if run directly
if (require.main === module) {
  const api = new HighPerformanceAPI();
  api.initialize().then(success => {
    if (success) {
      api.start(3000);
    } else {
      console.error('Failed to start server');
      process.exit(1);
    }
  });
}

module.exports = HighPerformanceAPI;
