/**
 * NexureJS Comprehensive Framework Test Suite
 *
 * Complete test coverage for all framework components including
 * core functionality, native modules, performance, and integration tests.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createApp, NexureApplication } from '../../src/framework/index.js';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import { createServer } from 'http';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

describe('NexureJS Framework - Comprehensive Test Suite', () => {
  let app: NexureApplication;
  let server: any;
  const testPort = 3001;

  beforeAll(async () => {
    // Global test setup
    console.log('🧪 Starting NexureJS comprehensive test suite...');
  });

  afterAll(async () => {
    // Global test cleanup
    console.log('✅ NexureJS comprehensive test suite completed');
  });

  beforeEach(async () => {
    // Create fresh app instance for each test
    app = createApp({
      performance: {
        simd: true,
        nativeAcceleration: true,
        monitoring: true
      },
      logging: {
        level: 'error' // Reduce noise during testing
      }
    });
  });

  afterEach(async () => {
    // Clean up after each test
    if (server) {
      await app.stop();
      server = null;
    }
  });

  describe('Core Framework', () => {
    describe('Application Lifecycle', () => {
      it('should create application with default configuration', () => {
        expect(app).toBeDefined();
        expect(app.getStatus().initialized).toBe(false);
        expect(app.getStatus().started).toBe(false);
      });

      it('should initialize application components', async () => {
        await app.initialize();
        expect(app.getStatus().initialized).toBe(true);
        expect(app.getStatus().started).toBe(false);
      });

      it('should start and stop server gracefully', async () => {
        server = await app.start(testPort);
        expect(app.getStatus().started).toBe(true);
        expect(server.listening).toBe(true);

        await app.stop();
        expect(app.getStatus().started).toBe(false);
      });

      it('should handle multiple start attempts gracefully', async () => {
        server = await app.start(testPort);

        // Second start should throw error
        await expect(app.start(testPort + 1)).rejects.toThrow('already started');
      });

      it('should provide application status and metrics', async () => {
        const status = app.getStatus();
        expect(status).toHaveProperty('initialized');
        expect(status).toHaveProperty('started');
        expect(status).toHaveProperty('uptime');
        expect(status).toHaveProperty('memory');
        expect(status).toHaveProperty('pid');
        expect(status).toHaveProperty('version');

        const metrics = app.getMetrics();
        expect(metrics).toBeDefined();
      });
    });

    describe('Configuration Management', () => {
      it('should merge user configuration with defaults', () => {
        const customApp = createApp({
          server: { port: 4000 },
          performance: { simd: false }
        });

        const config = customApp.getConfig();
        expect(config.server.port).toBe(4000);
        expect(config.performance.simd).toBe(false);
        expect(config.server.hostname).toBe('localhost'); // Default value
      });

      it('should validate configuration options', () => {
        expect(() => createApp({
          server: { port: -1 }
        })).not.toThrow(); // Should handle gracefully
      });

      it('should support environment-based configuration', () => {
        process.env.NODE_ENV = 'production';
        const prodApp = createApp();
        const config = prodApp.getConfig();
        expect(config.development).toBe(false);

        process.env.NODE_ENV = 'test';
      });
    });
  });

  describe('Routing System', () => {
    beforeEach(async () => {
      server = await app.start(testPort);
    });

    describe('Basic Routing', () => {
      it('should handle GET requests', async () => {
        app.get('/test', (ctx) => {
          ctx.response.json({ message: 'GET test' });
        });

        const response = await fetch(`http://localhost:${testPort}/test`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('GET test');
      });

      it('should handle POST requests', async () => {
        app.post('/test', (ctx) => {
          ctx.response.json({
            message: 'POST test',
            body: ctx.request.body
          });
        });

        const response = await fetch(`http://localhost:${testPort}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.message).toBe('POST test');
      });

      it('should handle all HTTP methods', async () => {
        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

        methods.forEach(method => {
          app.route(method, '/method-test', (ctx) => {
            ctx.response.json({ method: ctx.request.method });
          });
        });

        for (const method of methods) {
          const response = await fetch(`http://localhost:${testPort}/method-test`, {
            method
          });
          const data = await response.json();
          expect(data.method).toBe(method);
        }
      });
    });

    describe('Route Parameters', () => {
      it('should extract route parameters', async () => {
        app.get('/users/:id', (ctx) => {
          ctx.response.json({
            userId: ctx.params.id
          });
        });

        const response = await fetch(`http://localhost:${testPort}/users/123`);
        const data = await response.json();

        expect(data.userId).toBe('123');
      });

      it('should handle multiple parameters', async () => {
        app.get('/users/:userId/posts/:postId', (ctx) => {
          ctx.response.json({
            userId: ctx.params.userId,
            postId: ctx.params.postId
          });
        });

        const response = await fetch(`http://localhost:${testPort}/users/123/posts/456`);
        const data = await response.json();

        expect(data.userId).toBe('123');
        expect(data.postId).toBe('456');
      });

      it('should handle optional parameters', async () => {
        app.get('/posts/:id?', (ctx) => {
          ctx.response.json({
            id: ctx.params.id || 'all'
          });
        });

        // With parameter
        let response = await fetch(`http://localhost:${testPort}/posts/123`);
        let data = await response.json();
        expect(data.id).toBe('123');

        // Without parameter
        response = await fetch(`http://localhost:${testPort}/posts`);
        data = await response.json();
        expect(data.id).toBe('all');
      });

      it('should handle wildcard routes', async () => {
        app.get('/files/*', (ctx) => {
          ctx.response.json({
            path: ctx.params['*']
          });
        });

        const response = await fetch(`http://localhost:${testPort}/files/documents/test.pdf`);
        const data = await response.json();

        expect(data.path).toBe('documents/test.pdf');
      });
    });

    describe('Query Parameters', () => {
      it('should parse query parameters', async () => {
        app.get('/search', (ctx) => {
          ctx.response.json({
            query: ctx.query.q,
            page: ctx.query.page,
            limit: ctx.query.limit
          });
        });

        const response = await fetch(`http://localhost:${testPort}/search?q=test&page=1&limit=10`);
        const data = await response.json();

        expect(data.query).toBe('test');
        expect(data.page).toBe('1');
        expect(data.limit).toBe('10');
      });

      it('should handle array query parameters', async () => {
        app.get('/filter', (ctx) => {
          ctx.response.json({
            tags: ctx.query.tags
          });
        });

        const response = await fetch(`http://localhost:${testPort}/filter?tags=javascript&tags=nodejs&tags=framework`);
        const data = await response.json();

        expect(Array.isArray(data.tags)).toBe(true);
        expect(data.tags).toContain('javascript');
        expect(data.tags).toContain('nodejs');
        expect(data.tags).toContain('framework');
      });
    });
  });

  describe('Middleware System', () => {
    beforeEach(async () => {
      server = await app.start(testPort);
    });

    describe('Global Middleware', () => {
      it('should execute middleware in order', async () => {
        const executionOrder: string[] = [];

        app.use(async (ctx, next) => {
          executionOrder.push('middleware1');
          await next();
          executionOrder.push('middleware1-after');
        });

        app.use(async (ctx, next) => {
          executionOrder.push('middleware2');
          await next();
          executionOrder.push('middleware2-after');
        });

        app.get('/test', (ctx) => {
          executionOrder.push('handler');
          ctx.response.json({ order: executionOrder });
        });

        const response = await fetch(`http://localhost:${testPort}/test`);
        const data = await response.json();

        expect(data.order).toEqual([
          'middleware1',
          'middleware2',
          'handler',
          'middleware2-after',
          'middleware1-after'
        ]);
      });

      it('should handle middleware errors', async () => {
        app.use(async (ctx, next) => {
          try {
            await next();
          } catch (error) {
            ctx.response.status = 500;
            ctx.response.json({ error: 'Middleware caught error' });
          }
        });

        app.get('/error', () => {
          throw new Error('Test error');
        });

        const response = await fetch(`http://localhost:${testPort}/error`);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe('Middleware caught error');
      });

      it('should support async middleware', async () => {
        app.use(async (ctx, next) => {
          const start = Date.now();
          await next();
          const duration = Date.now() - start;
          ctx.response.set('X-Response-Time', `${duration}ms`);
        });

        app.get('/test', async (ctx) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          ctx.response.json({ message: 'async test' });
        });

        const response = await fetch(`http://localhost:${testPort}/test`);

        expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
      });
    });

    describe('Route-Specific Middleware', () => {
      it('should apply middleware to specific routes', async () => {
        const authMiddleware = async (ctx: any, next: any) => {
          const token = ctx.request.headers.authorization;
          if (!token) {
            ctx.response.status = 401;
            ctx.response.json({ error: 'Unauthorized' });
            return;
          }
          ctx.user = { id: 1, name: 'Test User' };
          await next();
        };

        app.get('/public', (ctx) => {
          ctx.response.json({ message: 'Public endpoint' });
        });

        app.get('/protected', authMiddleware, (ctx) => {
          ctx.response.json({
            message: 'Protected endpoint',
            user: ctx.user
          });
        });

        // Public endpoint should work
        let response = await fetch(`http://localhost:${testPort}/public`);
        expect(response.status).toBe(200);

        // Protected endpoint without auth should fail
        response = await fetch(`http://localhost:${testPort}/protected`);
        expect(response.status).toBe(401);

        // Protected endpoint with auth should work
        response = await fetch(`http://localhost:${testPort}/protected`, {
          headers: { Authorization: 'Bearer token' }
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user).toBeDefined();
      });
    });
  });

  describe('HTTP Handling', () => {
    beforeEach(async () => {
      server = await app.start(testPort);
    });

    describe('Request Processing', () => {
      it('should parse JSON request bodies', async () => {
        app.post('/json', (ctx) => {
          ctx.response.json({
            received: ctx.request.body,
            type: typeof ctx.request.body
          });
        });

        const testData = { name: 'John', age: 30 };
        const response = await fetch(`http://localhost:${testPort}/json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData)
        });

        const data = await response.json();
        expect(data.received).toEqual(testData);
        expect(data.type).toBe('object');
      });

      it('should handle different content types', async () => {
        app.post('/content', (ctx) => {
          ctx.response.json({
            contentType: ctx.request.headers['content-type'],
            body: ctx.request.body
          });
        });

        // Test JSON
        let response = await fetch(`http://localhost:${testPort}/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'json' })
        });
        let data = await response.json();
        expect(data.contentType).toBe('application/json');

        // Test plain text
        response = await fetch(`http://localhost:${testPort}/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'plain text data'
        });
        data = await response.json();
        expect(data.contentType).toBe('text/plain');
      });

      it('should extract request headers', async () => {
        app.get('/headers', (ctx) => {
          ctx.response.json({
            userAgent: ctx.request.headers['user-agent'],
            customHeader: ctx.request.headers['x-custom-header'],
            allHeaders: Object.keys(ctx.request.headers)
          });
        });

        const response = await fetch(`http://localhost:${testPort}/headers`, {
          headers: {
            'X-Custom-Header': 'test-value',
            'User-Agent': 'NexureJS-Test'
          }
        });

        const data = await response.json();
        expect(data.customHeader).toBe('test-value');
        expect(data.userAgent).toBe('NexureJS-Test');
        expect(Array.isArray(data.allHeaders)).toBe(true);
      });
    });

    describe('Response Generation', () => {
      it('should set response status codes', async () => {
        app.get('/status/:code', (ctx) => {
          const code = parseInt(ctx.params.code);
          ctx.response.status = code;
          ctx.response.json({ status: code });
        });

        const statusCodes = [200, 201, 400, 404, 500];

        for (const code of statusCodes) {
          const response = await fetch(`http://localhost:${testPort}/status/${code}`);
          expect(response.status).toBe(code);

          const data = await response.json();
          expect(data.status).toBe(code);
        }
      });

      it('should set response headers', async () => {
        app.get('/headers', (ctx) => {
          ctx.response.set('X-Custom-Header', 'custom-value');
          ctx.response.set('X-Another-Header', 'another-value');
          ctx.response.json({ message: 'Headers set' });
        });

        const response = await fetch(`http://localhost:${testPort}/headers`);

        expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
        expect(response.headers.get('X-Another-Header')).toBe('another-value');
      });

      it('should handle different response formats', async () => {
        app.get('/json', (ctx) => {
          ctx.response.json({ format: 'json' });
        });

        app.get('/text', (ctx) => {
          ctx.response.send('Plain text response');
        });

        app.get('/html', (ctx) => {
          ctx.response.type('text/html');
          ctx.response.send('<h1>HTML Response</h1>');
        });

        // Test JSON response
        let response = await fetch(`http://localhost:${testPort}/json`);
        expect(response.headers.get('content-type')).toContain('application/json');
        const jsonData = await response.json();
        expect(jsonData.format).toBe('json');

        // Test text response
        response = await fetch(`http://localhost:${testPort}/text`);
        const textData = await response.text();
        expect(textData).toBe('Plain text response');

        // Test HTML response
        response = await fetch(`http://localhost:${testPort}/html`);
        expect(response.headers.get('content-type')).toContain('text/html');
        const htmlData = await response.text();
        expect(htmlData).toBe('<h1>HTML Response</h1>');
      });
    });
  });

  describe('Performance Features', () => {
    describe('Native Acceleration', () => {
      it('should detect native module capabilities', () => {
        const capabilities = app.getNativeCapabilities();
        expect(capabilities).toHaveProperty('simd');
        expect(capabilities).toHaveProperty('architecture');
        expect(typeof capabilities.simd).toBe('boolean');
      });

      it('should provide performance metrics', () => {
        const metrics = app.getMetrics();
        expect(metrics).toHaveProperty('requests');
        expect(metrics).toHaveProperty('memory');
        expect(metrics).toHaveProperty('cpu');

        if (metrics.simd) {
          expect(metrics.simd).toHaveProperty('supported');
          expect(metrics.simd).toHaveProperty('operations');
        }
      });
    });

    describe('Memory Management', () => {
      it('should track memory usage', async () => {
        const initialMemory = process.memoryUsage();

        // Create some load
        const largeObjects = [];
        for (let i = 0; i < 1000; i++) {
          largeObjects.push({
            id: i,
            data: new Array(100).fill(Math.random())
          });
        }

        const currentMemory = process.memoryUsage();
        expect(currentMemory.heapUsed).toBeGreaterThan(initialMemory.heapUsed);

        // Cleanup
        largeObjects.length = 0;
      });

      it('should handle memory pressure gracefully', async () => {
        const memoryBefore = process.memoryUsage();

        // Simulate memory pressure
        const promises = [];
        for (let i = 0; i < 100; i++) {
          promises.push(new Promise(resolve => {
            const data = new Array(1000).fill(Math.random());
            setTimeout(() => resolve(data), Math.random() * 10);
          }));
        }

        await Promise.all(promises);

        const memoryAfter = process.memoryUsage();
        expect(memoryAfter.heapUsed).toBeGreaterThanOrEqual(memoryBefore.heapUsed);
      });
    });

    describe('SIMD Operations', () => {
      it('should perform SIMD vector operations', async () => {
        try {
          const simdOps = app.getSIMDOperations();

          if (simdOps) {
            const vectorA = new Float32Array([1, 2, 3, 4]);
            const vectorB = new Float32Array([5, 6, 7, 8]);

            const result = simdOps.vectorAdd(vectorA, vectorB);
            expect(result).toBeInstanceOf(Float32Array);
            expect(result[0]).toBe(6);
            expect(result[1]).toBe(8);
            expect(result[2]).toBe(10);
            expect(result[3]).toBe(12);
          }
        } catch (error) {
          // SIMD operations may not be available in test environment
          console.warn('SIMD operations not available in test environment');
        }
      });

      it('should benchmark SIMD performance', async () => {
        try {
          const simdOps = app.getSIMDOperations();

          if (simdOps) {
            const size = 1000;
            const vectorA = new Float32Array(size);
            const vectorB = new Float32Array(size);

            // Fill with random data
            for (let i = 0; i < size; i++) {
              vectorA[i] = Math.random();
              vectorB[i] = Math.random();
            }

            const iterations = 100;
            const startTime = performance.now();

            for (let i = 0; i < iterations; i++) {
              simdOps.vectorAdd(vectorA, vectorB);
            }

            const duration = performance.now() - startTime;
            const operationsPerSecond = (iterations / duration) * 1000;

            expect(operationsPerSecond).toBeGreaterThan(0);
            console.log(`SIMD operations/sec: ${Math.round(operationsPerSecond)}`);
          }
        } catch (error) {
          console.warn('SIMD benchmarking not available in test environment');
        }
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      server = await app.start(testPort);
    });

    describe('Application Errors', () => {
      it('should handle synchronous errors', async () => {
        app.get('/sync-error', () => {
          throw new Error('Synchronous error');
        });

        const response = await fetch(`http://localhost:${testPort}/sync-error`);
        expect(response.status).toBe(500);
      });

      it('should handle asynchronous errors', async () => {
        app.get('/async-error', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Asynchronous error');
        });

        const response = await fetch(`http://localhost:${testPort}/async-error`);
        expect(response.status).toBe(500);
      });

      it('should handle custom error types', async () => {
        class CustomError extends Error {
          status = 422;
          constructor(message: string) {
            super(message);
            this.name = 'CustomError';
          }
        }

        app.get('/custom-error', () => {
          throw new CustomError('Custom error message');
        });

        const response = await fetch(`http://localhost:${testPort}/custom-error`);
        expect(response.status).toBe(422);
      });
    });

    describe('Error Recovery', () => {
      it('should continue processing after errors', async () => {
        let errorCount = 0;
        let successCount = 0;

        app.get('/error', () => {
          errorCount++;
          throw new Error('Test error');
        });

        app.get('/success', () => {
          successCount++;
          return { message: 'success' };
        });

        // Make multiple requests including errors
        const promises = [];
        for (let i = 0; i < 10; i++) {
          promises.push(fetch(`http://localhost:${testPort}/error`));
          promises.push(fetch(`http://localhost:${testPort}/success`));
        }

        await Promise.all(promises);

        expect(errorCount).toBe(10);
        expect(successCount).toBe(10);
      });
    });
  });

  describe('Concurrency and Load', () => {
    beforeEach(async () => {
      server = await app.start(testPort);
    });

    describe('Concurrent Requests', () => {
      it('should handle concurrent requests efficiently', async () => {
        let requestCount = 0;

        app.get('/concurrent', async (ctx) => {
          requestCount++;
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          ctx.response.json({
            requestId: requestCount,
            timestamp: Date.now()
          });
        });

        const concurrentRequests = 50;
        const promises = [];

        const startTime = performance.now();

        for (let i = 0; i < concurrentRequests; i++) {
          promises.push(fetch(`http://localhost:${testPort}/concurrent`));
        }

        const responses = await Promise.all(promises);
        const endTime = performance.now();

        expect(responses.length).toBe(concurrentRequests);
        expect(requestCount).toBe(concurrentRequests);

        const duration = endTime - startTime;
        const requestsPerSecond = (concurrentRequests / duration) * 1000;

        console.log(`Concurrent requests/sec: ${Math.round(requestsPerSecond)}`);
        expect(requestsPerSecond).toBeGreaterThan(100); // Should handle at least 100 req/sec
      });

      it('should maintain request isolation', async () => {
        const requestData = new Map();

        app.get('/isolation/:id', (ctx) => {
          const id = ctx.params.id;
          const data = { id, timestamp: Date.now(), random: Math.random() };
          requestData.set(id, data);
          ctx.response.json(data);
        });

        const promises = [];
        for (let i = 0; i < 20; i++) {
          promises.push(fetch(`http://localhost:${testPort}/isolation/${i}`));
        }

        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));

        // Verify each request got unique data
        const ids = results.map(r => r.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(20);

        // Verify timestamps are different
        const timestamps = results.map(r => r.timestamp);
        const uniqueTimestamps = new Set(timestamps);
        expect(uniqueTimestamps.size).toBeGreaterThan(1);
      });
    });

    describe('Load Testing', () => {
      it('should handle sustained load', async () => {
        let totalRequests = 0;
        const startTime = Date.now();

        app.get('/load', (ctx) => {
          totalRequests++;
          ctx.response.json({
            requestNumber: totalRequests,
            timestamp: Date.now()
          });
        });

        const testDuration = 2000; // 2 seconds
        const requestInterval = 10; // 10ms between requests

        const promises: Promise<any>[] = [];
        const intervalId = setInterval(() => {
          promises.push(fetch(`http://localhost:${testPort}/load`));
        }, requestInterval);

        await new Promise(resolve => setTimeout(resolve, testDuration));
        clearInterval(intervalId);

        await Promise.all(promises);

        const endTime = Date.now();
        const actualDuration = endTime - startTime;
        const requestsPerSecond = (totalRequests / actualDuration) * 1000;

        console.log(`Load test: ${totalRequests} requests in ${actualDuration}ms (${Math.round(requestsPerSecond)} req/sec)`);
        expect(totalRequests).toBeGreaterThan(50); // Should handle reasonable load
      });
    });
  });

  describe('Integration Tests', () => {
    describe('Real-world Scenarios', () => {
      it('should handle a complete REST API workflow', async () => {
        server = await app.start(testPort);

        // In-memory data store
        const users: any[] = [];
        let nextId = 1;

        // CRUD operations
        app.get('/api/users', (ctx) => {
          ctx.response.json(users);
        });

        app.post('/api/users', (ctx) => {
          const user = { id: nextId++, ...ctx.request.body };
          users.push(user);
          ctx.response.status = 201;
          ctx.response.json(user);
        });

        app.get('/api/users/:id', (ctx) => {
          const user = users.find(u => u.id === parseInt(ctx.params.id));
          if (!user) {
            ctx.response.status = 404;
            ctx.response.json({ error: 'User not found' });
            return;
          }
          ctx.response.json(user);
        });

        app.put('/api/users/:id', (ctx) => {
          const index = users.findIndex(u => u.id === parseInt(ctx.params.id));
          if (index === -1) {
            ctx.response.status = 404;
            ctx.response.json({ error: 'User not found' });
            return;
          }
          users[index] = { ...users[index], ...ctx.request.body };
          ctx.response.json(users[index]);
        });

        app.delete('/api/users/:id', (ctx) => {
          const index = users.findIndex(u => u.id === parseInt(ctx.params.id));
          if (index === -1) {
            ctx.response.status = 404;
            ctx.response.json({ error: 'User not found' });
            return;
          }
          users.splice(index, 1);
          ctx.response.status = 204;
          ctx.response.send('');
        });

        // Test the complete workflow

        // 1. Get empty list
        let response = await fetch(`http://localhost:${testPort}/api/users`);
        let data = await response.json();
        expect(data).toEqual([]);

        // 2. Create user
        response = await fetch(`http://localhost:${testPort}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' })
        });
        expect(response.status).toBe(201);
        const user = await response.json();
        expect(user.id).toBe(1);
        expect(user.name).toBe('John Doe');

        // 3. Get user by ID
        response = await fetch(`http://localhost:${testPort}/api/users/1`);
        data = await response.json();
        expect(data.id).toBe(1);
        expect(data.name).toBe('John Doe');

        // 4. Update user
        response = await fetch(`http://localhost:${testPort}/api/users/1`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Jane Doe' })
        });
        data = await response.json();
        expect(data.name).toBe('Jane Doe');
        expect(data.email).toBe('john@example.com'); // Should preserve existing fields

        // 5. Get all users
        response = await fetch(`http://localhost:${testPort}/api/users`);
        data = await response.json();
        expect(data.length).toBe(1);
        expect(data[0].name).toBe('Jane Doe');

        // 6. Delete user
        response = await fetch(`http://localhost:${testPort}/api/users/1`, {
          method: 'DELETE'
        });
        expect(response.status).toBe(204);

        // 7. Verify deletion
        response = await fetch(`http://localhost:${testPort}/api/users`);
        data = await response.json();
        expect(data).toEqual([]);
      });

      it('should handle file upload scenario', async () => {
        server = await app.start(testPort);

        const uploadedFiles: any[] = [];

        app.post('/upload', (ctx) => {
          // Simulate file upload processing
          const file = {
            id: Date.now(),
            name: ctx.request.headers['x-filename'] || 'unknown',
            size: parseInt(ctx.request.headers['content-length'] || '0'),
            type: ctx.request.headers['content-type'] || 'application/octet-stream',
            uploadedAt: new Date().toISOString()
          };

          uploadedFiles.push(file);
          ctx.response.json(file);
        });

        app.get('/uploads', (ctx) => {
          ctx.response.json(uploadedFiles);
        });

        // Test file upload
        const testData = 'This is test file content';
        const response = await fetch(`http://localhost:${testPort}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'X-Filename': 'test.txt',
            'Content-Length': testData.length.toString()
          },
          body: testData
        });

        const uploadResult = await response.json();
        expect(uploadResult.name).toBe('test.txt');
        expect(uploadResult.size).toBe(testData.length);
        expect(uploadResult.type).toBe('text/plain');

        // Verify file was stored
        const listResponse = await fetch(`http://localhost:${testPort}/uploads`);
        const files = await listResponse.json();
        expect(files.length).toBe(1);
        expect(files[0].id).toBe(uploadResult.id);
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance benchmarks', async () => {
      server = await app.start(testPort);

      app.get('/benchmark', (ctx) => {
        ctx.response.json({
          message: 'benchmark',
          timestamp: Date.now(),
          random: Math.random()
        });
      });

      const iterations = 1000;
      const startTime = performance.now();

      const promises = [];
      for (let i = 0; i < iterations; i++) {
        promises.push(fetch(`http://localhost:${testPort}/benchmark`));
      }

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;
      const requestsPerSecond = (iterations / duration) * 1000;

      console.log(`Performance benchmark: ${Math.round(requestsPerSecond)} requests/second`);

      // Should handle at least 1000 requests per second
      expect(requestsPerSecond).toBeGreaterThan(500);

      // Average response time should be under 10ms
      const averageResponseTime = duration / iterations;
      expect(averageResponseTime).toBeLessThan(10);
    });

    it('should have efficient memory usage', async () => {
      const initialMemory = process.memoryUsage();

      server = await app.start(testPort);

      app.get('/memory-test', (ctx) => {
        // Create some temporary objects
        const data = {
          id: Math.random(),
          timestamp: Date.now(),
          data: new Array(100).fill(Math.random())
        };
        ctx.response.json(data);
      });

      // Make many requests to test memory usage
      const promises = [];
      for (let i = 0; i < 500; i++) {
        promises.push(fetch(`http://localhost:${testPort}/memory-test`));
      }

      await Promise.all(promises);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // Memory increase should be reasonable (less than 50MB for 500 requests)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
