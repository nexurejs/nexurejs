#!/usr/bin/env node

/**
 * Framework Server Generators
 * Creates identical API endpoints for all supported frameworks
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

// Express Server Generator
function createExpressServer(port) {
  const testData = generateTestData();

  const serverCode = `
const express = require('express');
const crypto = require('crypto');
const app = express();

const testData = ${JSON.stringify(testData)};

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ limit: '50mb' }));
app.use((req, res, next) => {
  res.header('X-Framework', 'Express');
  next();
});

// Routes
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
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.json({ data: users, pagination: { page, limit, total: testData.users.length } });
});

app.post('/api/upload', (req, res) => {
  res.json({ size: req.body.length, processed: Date.now() });
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
    users: testData.users,
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  res.json(largeData);
});

app.post('/api/memory/stress', (req, res) => {
  const { data } = req.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  res.json({ processed: processed.length, memoryUsage: process.memoryUsage() });
});

app.get('/api/error/test', (req, res) => {
  if (req.query.shouldError === 'true') {
    return res.status(500).json({ error: 'Simulated error', code: 'TEST_ERROR' });
  }
  res.json({ success: true, message: 'No error triggered' });
});

app.get('/static/large-file.json', (req, res) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(largeFile);
});

app.post('/api/middleware/chain', (req, res) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  res.json({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: req.body
  });
});

app.listen(${port}, () => {
  console.log('Express server running on port ${port}');
});
`;

  return { code: serverCode, filename: `express-server-${port}.cjs` };
}

// Fastify Server Generator
function createFastifyServer(port) {
  const testData = generateTestData();

  const serverCode = `
const fastify = require('fastify')({ logger: false });
const crypto = require('crypto');

const testData = ${JSON.stringify(testData)};

// Routes with identical functionality to Express
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
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  return { data: users, pagination: { page, limit, total: testData.users.length } };
});

fastify.post('/api/upload', async (request, reply) => {
  return { size: request.body.length, processed: Date.now() };
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
    users: testData.users,
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  return largeData;
});

fastify.post('/api/memory/stress', async (request, reply) => {
  const { data } = request.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  return { processed: processed.length, memoryUsage: process.memoryUsage() };
});

fastify.get('/api/error/test', async (request, reply) => {
  if (request.query.shouldError === 'true') {
    reply.status(500);
    return { error: 'Simulated error', code: 'TEST_ERROR' };
  }
  return { success: true, message: 'No error triggered' };
});

fastify.get('/static/large-file.json', async (request, reply) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  reply.header('Cache-Control', 'public, max-age=3600');
  return largeFile;
});

fastify.post('/api/middleware/chain', async (request, reply) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  return {
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: request.body
  };
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

// Koa Server Generator
function createKoaServer(port) {
  const testData = generateTestData();

  const serverCode = `
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const crypto = require('crypto');

const app = new Koa();
const router = new Router();
const testData = ${JSON.stringify(testData)};

// Middleware
app.use(bodyParser({ jsonLimit: '50mb' }));
app.use(async (ctx, next) => {
  ctx.set('X-Framework', 'Koa');
  await next();
});

// Routes
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

router.post('/api/upload', (ctx) => {
  ctx.body = { size: ctx.request.body.length, processed: Date.now() };
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
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  ctx.body = largeData;
});

router.post('/api/memory/stress', (ctx) => {
  const { data } = ctx.request.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  ctx.body = { processed: processed.length, memoryUsage: process.memoryUsage() };
});

router.get('/api/error/test', (ctx) => {
  if (ctx.query.shouldError === 'true') {
    ctx.status = 500;
    ctx.body = { error: 'Simulated error', code: 'TEST_ERROR' };
    return;
  }
  ctx.body = { success: true, message: 'No error triggered' };
});

router.get('/static/large-file.json', (ctx) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  ctx.set('Cache-Control', 'public, max-age=3600');
  ctx.body = largeFile;
});

router.post('/api/middleware/chain', (ctx) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  ctx.body = {
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: ctx.request.body
  };
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(${port}, () => {
  console.log('Koa server running on port ${port}');
});
`;

  return { code: serverCode, filename: `koa-server-${port}.cjs` };
}

// Hapi Server Generator
function createHapiServer(port) {
  const testData = generateTestData();

  const serverCode = `
const Hapi = require('@hapi/hapi');
const crypto = require('crypto');

const testData = ${JSON.stringify(testData)};

const init = async () => {
  const server = Hapi.server({
    port: ${port},
    host: 'localhost'
  });

  // Add headers
  server.ext('onPreResponse', (request, h) => {
    if (request.response.isBoom) {
      return h.continue;
    }
    request.response.header('X-Framework', 'Hapi');
    return h.continue;
  });

  // Routes
  server.route({
    method: 'GET',
    path: '/api/hello',
    handler: (request, h) => {
      return { message: 'Hello from Hapi!', timestamp: Date.now() };
    }
  });

  server.route({
    method: 'POST',
    path: '/api/users',
    handler: (request, h) => {
      const user = { id: crypto.randomUUID(), ...request.payload, created: Date.now() };
      return user;
    }
  });

  server.route({
    method: 'GET',
    path: '/api/users',
    handler: (request, h) => {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 10;
      const start = (page - 1) * limit;
      const users = testData.users.slice(start, start + limit);
      return { data: users, pagination: { page, limit, total: testData.users.length } };
    }
  });

  server.route({
    method: 'POST',
    path: '/api/upload',
    handler: (request, h) => {
      return { size: request.payload.length, processed: Date.now() };
    }
  });

  server.route({
    method: 'POST',
    path: '/api/compute',
    handler: (request, h) => {
      const { numbers } = request.payload;
      let result = 0;
      for (let i = 0; i < numbers.length; i++) {
        for (let j = 0; j < 50; j++) {
          result += Math.sqrt(numbers[i] * numbers[i] + j);
        }
      }
      return { result: result.toFixed(2), operations: numbers.length * 50 };
    }
  });

  server.route({
    method: 'GET',
    path: '/api/export/large',
    handler: (request, h) => {
      const largeData = {
        users: testData.users,
        products: testData.products,
        metadata: { exported: Date.now(), size: 'large' },
        additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
      };
      return largeData;
    }
  });

  server.route({
    method: 'POST',
    path: '/api/memory/stress',
    handler: (request, h) => {
      const { data } = request.payload;
      const processed = data.map(item => ({
        ...item,
        processed: true,
        hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
      }));
      return { processed: processed.length, memoryUsage: process.memoryUsage() };
    }
  });

  server.route({
    method: 'GET',
    path: '/api/error/test',
    handler: (request, h) => {
      if (request.query.shouldError === 'true') {
        const error = new Error('Simulated error');
        error.statusCode = 500;
        throw error;
      }
      return { success: true, message: 'No error triggered' };
    }
  });

  server.route({
    method: 'GET',
    path: '/static/large-file.json',
    handler: (request, h) => {
      const largeFile = {
        data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
        metadata: { size: 'large', type: 'static' }
      };
      return h.response(largeFile).header('Cache-Control', 'public, max-age=3600');
    }
  });

  server.route({
    method: 'POST',
    path: '/api/middleware/chain',
    handler: (request, h) => {
      const middlewareResults = [
        { name: 'auth', duration: Math.random() * 5 },
        { name: 'validation', duration: Math.random() * 3 },
        { name: 'logging', duration: Math.random() * 2 }
      ];
      return {
        middlewareChain: middlewareResults,
        totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
        body: request.payload
      };
    }
  });

  await server.start();
  console.log('Hapi server running on port ${port}');
};

process.on('unhandledRejection', (err) => {
  console.log(err);
  process.exit(1);
});

init();
`;

  return { code: serverCode, filename: `hapi-server-${port}.cjs` };
}

// Restify Server Generator
function createRestifyServer(port) {
  const testData = generateTestData();

  const serverCode = `
const restify = require('restify');
const crypto = require('crypto');

const testData = ${JSON.stringify(testData)};

const server = restify.createServer();

server.use(restify.plugins.bodyParser());
server.use(restify.plugins.queryParser());

// Add headers
server.use((req, res, next) => {
  res.header('X-Framework', 'Restify');
  next();
});

// Routes
server.get('/api/hello', (req, res, next) => {
  res.json({ message: 'Hello from Restify!', timestamp: Date.now() });
  next();
});

server.post('/api/users', (req, res, next) => {
  const user = { id: crypto.randomUUID(), ...req.body, created: Date.now() };
  res.json(user);
  next();
});

server.get('/api/users', (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  res.json({ data: users, pagination: { page, limit, total: testData.users.length } });
  next();
});

server.post('/api/upload', (req, res, next) => {
  res.json({ size: req.body.length, processed: Date.now() });
  next();
});

server.post('/api/compute', (req, res, next) => {
  const { numbers } = req.body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  res.json({ result: result.toFixed(2), operations: numbers.length * 50 });
  next();
});

server.get('/api/export/large', (req, res, next) => {
  const largeData = {
    users: testData.users,
    products: testData.products,
    metadata: { exported: Date.now(), size: 'large' },
    additionalData: Array.from({length: 500}, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
  };
  res.json(largeData);
  next();
});

server.post('/api/memory/stress', (req, res, next) => {
  const { data } = req.body;
  const processed = data.map(item => ({
    ...item,
    processed: true,
    hash: crypto.createHash('md5').update(JSON.stringify(item)).digest('hex')
  }));
  res.json({ processed: processed.length, memoryUsage: process.memoryUsage() });
  next();
});

server.get('/api/error/test', (req, res, next) => {
  if (req.query.shouldError === 'true') {
    res.status(500);
    res.json({ error: 'Simulated error', code: 'TEST_ERROR' });
    return next();
  }
  res.json({ success: true, message: 'No error triggered' });
  next();
});

server.get('/static/large-file.json', (req, res, next) => {
  const largeFile = {
    data: Array.from({length: 1000}, (_, i) => ({ id: i, content: 'Static file content ' + 'x'.repeat(50) })),
    metadata: { size: 'large', type: 'static' }
  };
  res.header('Cache-Control', 'public, max-age=3600');
  res.json(largeFile);
  next();
});

server.post('/api/middleware/chain', (req, res, next) => {
  const middlewareResults = [
    { name: 'auth', duration: Math.random() * 5 },
    { name: 'validation', duration: Math.random() * 3 },
    { name: 'logging', duration: Math.random() * 2 }
  ];
  res.json({
    middlewareChain: middlewareResults,
    totalDuration: middlewareResults.reduce((sum, m) => sum + m.duration, 0),
    body: req.body
  });
  next();
});

server.listen(${port}, () => {
  console.log('Restify server running on port ${port}');
});
`;

  return { code: serverCode, filename: `restify-server-${port}.cjs` };
}

module.exports = {
  createExpressServer,
  createFastifyServer,
  createKoaServer,
  createHapiServer,
  createRestifyServer,
  generateTestData
};
