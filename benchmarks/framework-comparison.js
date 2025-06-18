#!/usr/bin/env node

/**
 * Framework Performance Comparison
 *
 * Compares NexureJS with Express, Fastify, and Koa
 * Tests: Hello World, JSON parsing, Routing performance
 */

import autocannon from 'autocannon';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const FRAMEWORKS = {
  nexurejs: {
    name: 'NexureJS',
    color: '\x1b[36m',
    setup: `
      import { Nexure, HttpMethod } from 'nexurejs';
      const app = new Nexure({ logger: { level: 'error' } });

      app.route({
        path: '/',
        method: HttpMethod.GET,
        handler: (req, res) => {
          res.status(200).json({ message: 'Hello World', framework: 'nexurejs' });
        }
      });

      app.route({
        path: '/user/:id',
        method: HttpMethod.GET,
        handler: (req, res) => {
          res.status(200).json({ id: req.params.id, name: 'User ' + req.params.id });
        }
      });

      app.listen(PORT);
    `
  },
  express: {
    name: 'Express',
    color: '\x1b[33m',
    setup: `
      import express from 'express';
      const app = express();

      app.get('/', (req, res) => {
        res.json({ message: 'Hello World', framework: 'express' });
      });

      app.get('/user/:id', (req, res) => {
        res.json({ id: req.params.id, name: 'User ' + req.params.id });
      });

      app.listen(PORT);
    `
  },
  fastify: {
    name: 'Fastify',
    color: '\x1b[32m',
    setup: `
      import Fastify from 'fastify';
      const app = Fastify({ logger: false });

      app.get('/', async (req, res) => {
        return { message: 'Hello World', framework: 'fastify' };
      });

      app.get('/user/:id', async (req, res) => {
        return { id: req.params.id, name: 'User ' + req.params.id };
      });

      app.listen({ port: PORT });
    `
  },
  koa: {
    name: 'Koa',
    color: '\x1b[35m',
    setup: `
      import Koa from 'koa';
      import Router from '@koa/router';

      const app = new Koa();
      const router = new Router();

      router.get('/', (ctx) => {
        ctx.body = { message: 'Hello World', framework: 'koa' };
      });

      router.get('/user/:id', (ctx) => {
        ctx.body = { id: ctx.params.id, name: 'User ' + ctx.params.id };
      });

      app.use(router.routes());
      app.listen(PORT);
    `
  }
};

const TESTS = [
  {
    name: 'Hello World',
    url: 'http://localhost:PORT/',
    duration: 10
  },
  {
    name: 'Route Parameters',
    url: 'http://localhost:PORT/user/123',
    duration: 10
  }
];

async function runBenchmark(framework, test, port) {
  return new Promise((resolve) => {
    const instance = autocannon({
      url: test.url.replace('PORT', port),
      connections: 100,
      pipelining: 10,
      duration: test.duration
    }, (err, result) => {
      if (err) {
        console.error('Benchmark error:', err);
        resolve(null);
        return;
      }
      resolve({
        framework: framework.name,
        test: test.name,
        requests: result.requests,
        throughput: result.throughput,
        latency: result.latency,
        errors: result.errors
      });
    });
  });
}

async function createServer(framework, code, port) {
  const serverCode = `
    const PORT = ${port};
    ${code}
    console.log('Server ready on port', PORT);
  `;

  const filename = `bench-${framework.name.toLowerCase()}-${Date.now()}.js`;
  await fs.writeFile(filename, serverCode);

  const proc = spawn('node', [filename], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('ready')) {
        resolve();
      }
    });
    setTimeout(resolve, 2000); // Fallback timeout
  });

  return { proc, filename };
}

async function main() {
  console.log('🚀 Framework Performance Comparison\n');

  const results = [];
  let port = 3000;

  for (const [key, framework] of Object.entries(FRAMEWORKS)) {
    console.log(`${framework.color}Testing ${framework.name}...${'\x1b[0m'}`);

    try {
      const { proc, filename } = await createServer(framework, framework.setup, port);

      for (const test of TESTS) {
        console.log(`  Running ${test.name} test...`);
        const result = await runBenchmark(framework, test, port);
        if (result) {
          results.push(result);
          console.log(`    Requests/sec: ${result.requests.average.toFixed(0)}`);
          console.log(`    Latency: ${result.latency.average.toFixed(2)}ms`);
        }
      }

      proc.kill();
      await fs.unlink(filename).catch(() => {});

    } catch (error) {
      console.error(`  Error testing ${framework.name}:`, error.message);
    }

    port++;
  }

  // Display results
  console.log('\n📊 Results Summary\n');
  console.log('Test: Hello World');
  console.log('━'.repeat(60));

  const helloWorldResults = results
    .filter(r => r.test === 'Hello World')
    .sort((a, b) => b.requests.average - a.requests.average);

  helloWorldResults.forEach((r, i) => {
    const bar = '█'.repeat(Math.floor(r.requests.average / 1000));
    console.log(`${i + 1}. ${r.framework.padEnd(10)} ${bar} ${r.requests.average.toFixed(0)} req/s`);
  });

  console.log('\nTest: Route Parameters');
  console.log('━'.repeat(60));

  const routeResults = results
    .filter(r => r.test === 'Route Parameters')
    .sort((a, b) => b.requests.average - a.requests.average);

  routeResults.forEach((r, i) => {
    const bar = '█'.repeat(Math.floor(r.requests.average / 1000));
    console.log(`${i + 1}. ${r.framework.padEnd(10)} ${bar} ${r.requests.average.toFixed(0)} req/s`);
  });

  // Save results
  await fs.writeFile(
    'benchmark-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n✅ Results saved to benchmark-results.json');
}

main().catch(console.error);
