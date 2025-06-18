#!/usr/bin/env node

/**
 * Production-Ready NexureJS API Server
 *
 * Demonstrates:
 * - Native HTTP parsing
 * - Native routing with parameters
 * - Native compression
 * - Native LRU caching
 * - Native JSON processing
 * - Authentication middleware
 * - Error handling
 * - Performance monitoring
 */

import { createServer } from 'node:http';
import {
  HttpParser,
  RadixRouter,
  JsonProcessor,
  CompressionWrapper,
  LRUCacheWrapper,
  ObjectPool,
  parseUrl,
  parseQueryString,
  configureNativeModules
} from '../../dist/build/src/index.js';

// Enable native modules with verbose logging
configureNativeModules({ enabled: true, verbose: true });

// Initialize native components
const httpParser = new HttpParser();
const router = new RadixRouter();
const json = new JsonProcessor();
const compression = new CompressionWrapper();
const cache = new LRUCacheWrapper({ capacity: 10000, ttl: 300000 }); // 5 min TTL
const pool = new ObjectPool();

// Middleware storage
const middlewares = [];

// Stats tracking
const stats = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  avgResponseTime: 0,
  totalResponseTime: 0
};

// Simple authentication (in production, use proper JWT/sessions)
const AUTH_TOKEN = 'Bearer nexure-secret-token';
const authenticatedUsers = new Map();

/**
 * Authentication middleware
 */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || auth !== AUTH_TOKEN) {
    res.statusCode = 401;
    res.end(json.stringify({ error: 'Unauthorized' }));
    return;
  }

  req.user = { id: 1, name: 'Admin User' };
  next();
}

/**
 * Logging middleware
 */
function loggingMiddleware(req, res, next) {
  const start = Date.now();

  // Monkey-patch res.end to log after response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);

    stats.totalResponseTime += duration;
    stats.avgResponseTime = stats.totalResponseTime / stats.requests;

    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Compression middleware
 */
async function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  if (acceptEncoding.includes('gzip')) {
    // Monkey-patch res.json to compress responses
    res.json = async function(data) {
      const jsonStr = json.stringify(data);
      const compressed = await compression.compress(jsonStr);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Encoding', 'gzip');
      res.end(compressed);
    };
  } else {
    // Non-compressed response
    res.json = function(data) {
      res.setHeader('Content-Type', 'application/json');
      res.end(json.stringify(data));
    };
  }

  next();
}

/**
 * Cache middleware factory
 */
function cacheMiddleware(ttl = 60000) {
  return async function(req, res, next) {
    const cacheKey = `${req.method}:${req.url}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      stats.cacheHits++;
      res.setHeader('X-Cache', 'HIT');
      res.json(cached);
      return;
    }

    stats.cacheMisses++;
    res.setHeader('X-Cache', 'MISS');

    // Store original json method
    const originalJson = res.json;
    res.json = async function(data) {
      // Cache the response
      cache.set(cacheKey, data, ttl);
      // Send response
      await originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  stats.errors++;
  console.error('Error:', err);

  res.statusCode = err.statusCode || 500;
  res.json({
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

/**
 * Route handlers
 */

// Health check
router.add('GET', '/health', {
  handler: async (req, res) => {
    const health = {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      stats: {
        ...stats,
        cacheMetrics: cache.getMetrics(),
        poolInfo: pool.getPoolInfo()
      },
      nativeModules: {
        compression: compression.isNative(),
        cache: cache.isNative()
      }
    };

    res.json(health);
  }
});

// Users endpoints
router.add('GET', '/api/users', {
  handler: async (req, res) => {
    const { page = '1', limit = '10' } = parseQueryString(req.url.split('?')[1] || '');

    // Simulate database query
    const users = Array.from({ length: parseInt(limit) }, (_, i) => ({
      id: (parseInt(page) - 1) * parseInt(limit) + i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      createdAt: new Date().toISOString()
    }));

    res.json({
      data: users,
      page: parseInt(page),
      limit: parseInt(limit),
      total: 100
    });
  },
  middlewares: [cacheMiddleware(60000)] // Cache for 1 minute
});

router.add('GET', '/api/users/:id', {
  handler: async (req, res) => {
    const { id } = req.params;

    res.json({
      id: parseInt(id),
      name: `User ${id}`,
      email: `user${id}@example.com`,
      profile: {
        bio: 'Lorem ipsum dolor sit amet',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`
      },
      createdAt: new Date().toISOString()
    });
  },
  middlewares: [cacheMiddleware(300000)] // Cache for 5 minutes
});

router.add('POST', '/api/users', {
  handler: async (req, res) => {
    const userData = req.body;

    // Validate
    if (!userData.name || !userData.email) {
      res.statusCode = 400;
      res.json({ error: 'Name and email are required' });
      return;
    }

    // "Create" user
    const newUser = {
      id: Date.now(),
      ...userData,
      createdAt: new Date().toISOString()
    };

    // Clear related caches
    cache.delete('GET:/api/users');

    res.statusCode = 201;
    res.json(newUser);
  },
  middlewares: [authMiddleware]
});

// Posts endpoints with nested resources
router.add('GET', '/api/posts/:postId/comments/:commentId', {
  handler: async (req, res) => {
    const { postId, commentId } = req.params;

    res.json({
      id: parseInt(commentId),
      postId: parseInt(postId),
      author: 'Comment Author',
      content: 'This is a comment',
      createdAt: new Date().toISOString()
    });
  },
  middlewares: [cacheMiddleware(120000)] // Cache for 2 minutes
});

// Benchmark endpoint
router.add('GET', '/api/benchmark', {
  handler: async (req, res) => {
    const iterations = 10000;
    const testData = { test: 'data', array: [1, 2, 3], nested: { value: true } };

    // Test JSON performance
    const jsonStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      json.parse(json.stringify(testData));
    }
    const jsonTime = performance.now() - jsonStart;

    // Test compression performance
    const compressStart = performance.now();
    const testString = 'Hello World! '.repeat(100);
    for (let i = 0; i < 100; i++) {
      await compression.compress(testString);
    }
    const compressTime = performance.now() - compressStart;

    res.json({
      iterations,
      results: {
        json: {
          totalMs: jsonTime.toFixed(2),
          opsPerSec: Math.round(iterations / (jsonTime / 1000))
        },
        compression: {
          totalMs: compressTime.toFixed(2),
          opsPerSec: Math.round(100 / (compressTime / 1000))
        }
      }
    });
  }
});

/**
 * Main request handler
 */
async function handleRequest(req, res) {
  const start = Date.now();
  stats.requests++;

  try {
    // Parse request body for POST/PUT
    let body = '';
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      for await (const chunk of req) {
        body += chunk;
      }

      if (body && req.headers['content-type']?.includes('application/json')) {
        try {
          req.body = json.parse(body);
        } catch (e) {
          res.statusCode = 400;
          res.json({ error: 'Invalid JSON body' });
          return;
        }
      }
    }

    // Find route
    const route = router.find(req.method, req.url.split('?')[0]);

    if (!route.found) {
      res.statusCode = 404;
      res.json({ error: 'Not found' });
      return;
    }

    // Add params to request
    req.params = route.params || {};

    // Execute middleware chain
    const allMiddlewares = [
      loggingMiddleware,
      compressionMiddleware,
      ...(route.handler.middlewares || [])
    ];

    let index = 0;
    const next = async (err) => {
      if (err) {
        return errorHandler(err, req, res, () => {});
      }

      if (index >= allMiddlewares.length) {
        // Execute handler
        return route.handler.handler(req, res);
      }

      const middleware = allMiddlewares[index++];
      try {
        await middleware(req, res, next);
      } catch (err) {
        next(err);
      }
    };

    await next();

  } catch (err) {
    errorHandler(err, req, res, () => {});
  }
}

/**
 * Start server
 */
const server = createServer(handleRequest);
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
🚀 NexureJS Production API Server
=================================
Port: ${PORT}
Native Compression: ${compression.isNative()}
Native Cache: ${cache.isNative()}

Endpoints:
  GET  /health                     - Health check
  GET  /api/users                  - List users (cached)
  GET  /api/users/:id              - Get user (cached)
  POST /api/users                  - Create user (auth required)
  GET  /api/posts/:id/comments/:id - Get comment (cached)
  GET  /api/benchmark              - Performance test

Example requests:
  curl http://localhost:${PORT}/health
  curl http://localhost:${PORT}/api/users?page=1&limit=5
  curl -H "Authorization: Bearer nexure-secret-token" \\
       -H "Content-Type: application/json" \\
       -d '{"name":"John","email":"john@example.com"}' \\
       http://localhost:${PORT}/api/users
  `);
});
