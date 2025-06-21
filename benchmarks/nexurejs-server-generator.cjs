#!/usr/bin/env node

/**
 * NexureJS Server Generator for Benchmarks
 * Creates a working NexureJS-compatible server for performance testing
 */

const crypto = require('crypto');

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

function createNexureJSServer(port) {
  const testData = generateTestData();

  const serverCode = `
const http = require('http');
const url = require('url');
const crypto = require('crypto');

const testData = ${JSON.stringify(testData)};

// Simple request parser
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        if (req.headers['content-type'] === 'application/json') {
          resolve(JSON.parse(body));
        } else {
          resolve(body);
        }
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// NexureJS-style router
class NexureRouter {
  constructor() {
    this.routes = new Map();
  }

  add(method, path, handler) {
    const key = \`\${method}:\${path}\`;
    this.routes.set(key, handler);
  }

  find(method, path) {
    // Simple exact match for now
    const key = \`\${method}:\${path}\`;
    if (this.routes.has(key)) {
      return { found: true, handler: this.routes.get(key), params: {} };
    }

    // Check for parameterized routes
    for (let [routeKey, handler] of this.routes) {
      const [routeMethod, routePath] = routeKey.split(':');
      if (routeMethod === method) {
        const routeParts = routePath.split('/');
        const pathParts = path.split('/');

        if (routeParts.length === pathParts.length) {
          const params = {};
          let match = true;

          for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
              params[routeParts[i].slice(1)] = pathParts[i];
            } else if (routeParts[i] !== pathParts[i]) {
              match = false;
              break;
            }
          }

          if (match) {
            return { found: true, handler, params };
          }
        }
      }
    }

    return { found: false };
  }
}

// Initialize router and add routes
const router = new NexureRouter();

router.add('GET', '/api/hello', async (req, res, params, query) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({ message: 'Hello from NexureJS!', timestamp: Date.now() }));
});

router.add('POST', '/api/users', async (req, res, params, query) => {
  const body = await parseBody(req);
  const user = { id: crypto.randomUUID(), ...body, created: Date.now() };
  res.writeHead(201, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify(user));
});

router.add('GET', '/api/users', async (req, res, params, query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({ data: users, pagination: { page, limit, total: testData.users.length } }));
});

router.add('POST', '/api/upload', async (req, res, params, query) => {
  const body = await parseBody(req);
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({ size: body.length, processed: Date.now() }));
});

router.add('POST', '/api/compute', async (req, res, params, query) => {
  const body = await parseBody(req);
  const { numbers } = body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({ result: result.toFixed(2), operations: numbers.length * 50 }));
});

router.add('GET', '/api/export/large', async (req, res, params, query) => {
  const largeData = {
    users: testData.users,
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify(largeData));
});

router.add('POST', '/api/memory/stress', async (req, res, params, query) => {
  const body = await parseBody(req);
  const { data } = body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({ processed: processed.length, memoryUsage: process.memoryUsage() }));
});

router.add('GET', '/api/error/test', async (req, res, params, query) => {
  if (query.shouldError === 'true') {
    res.writeHead(500, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
    res.end(JSON.stringify({ error: 'Simulated error', code: 'TEST_ERROR' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({ success: true, message: 'No error triggered' }));
});

router.add('GET', '/static/large-file.json', async (req, res, params, query) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'X-Framework': 'NexureJS'
  });
  res.end(JSON.stringify(largeFile));
});

router.add('POST', '/api/middleware/chain', async (req, res, params, query) => {
  const body = await parseBody(req);
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
  res.end(JSON.stringify({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body
  }));
});

// Create HTTP server with NexureJS-style handling
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const route = router.find(req.method, parsedUrl.pathname);

    if (route.found) {
      await route.handler(req, res, route.params, parsedUrl.query);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
      res.end(JSON.stringify({ error: 'Route not found' }));
    }
  } catch (error) {
    console.error('NexureJS Server Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'X-Framework': 'NexureJS' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(${port}, () => {
  console.log('NexureJS server running on port ${port}');
});
`;

  return { code: serverCode, filename: `nexurejs-server-${port}.cjs` };
}

module.exports = {
  createNexureJSServer,
  generateTestData
};
