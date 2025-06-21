/**
 * Static File Server Benchmark
 *
 * This script benchmarks the optimized static file middleware with buffer pooling
 * against standard Node.js static file serving.
 */

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticMiddleware } from '../src/middleware/static-files.js';
import { startServer } from './static-file-server.js';

// Get __dirname equivalent in ESM
const __dirname = new URL('.', import.meta.url).pathname;
const STATIC_DIR = join(__dirname, 'public');

// MIME types for standard server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream'
};

/**
 * Create a standard Node.js static file server
 */
function createStandardServer(port) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      // Only handle GET requests
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }

      // Parse the URL
      let path = req.url || '/';
      if (path === '/') path = '/index.html';
      if (path === '/stats') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          memory: process.memoryUsage(),
          uptime: process.uptime()
        }, null, 2));
        return;
      }

      // Resolve the file path
      const filePath = join(STATIC_DIR, path);

      try {
        // Get file stats
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        // Set content type
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);

        // Set cache control
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Stream the file
        const stream = createReadStream(filePath);
        stream.pipe(res);

        // Handle errors
        stream.on('error', () => {
          res.statusCode = 500;
          res.end('Internal Server Error');
        });
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });

    server.listen(port, () => {
      console.log(`Standard server running at http://localhost:${port}/`);
      resolve(server);
    });
  });
}

/**
 * Create an optimized server with buffer pooling
 */
async function createOptimizedServer(port) {
  // Start the server
  const app = await startServer();
  console.log(`Optimized server running at http://localhost:${port}/`);
  return app;
}

/**
 * Run a benchmark
 */
async function runBenchmark(url, concurrency, duration) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');

    // Use autocannon for benchmarking (install with: npm install -g autocannon)
    const autocannon = execFile('npx', [
      'autocannon',
      '-c', concurrency.toString(),
      '-d', duration.toString(),
      url
    ]);

    let output = '';
    autocannon.stdout.on('data', (data) => {
      output += data;
      process.stdout.write(data);
    });

    autocannon.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    autocannon.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Benchmark failed with code ${code}`));
        return;
      }

      resolve(output);
    });
  });
}

/**
 * Run the benchmark
 */
async function main() {
  // First, ensure the server with sample files is created
  await startServer();

  // Create the standard server
  const standardServer = await createStandardServer(3001);

  console.log('\n======= BENCHMARKING SMALL FILE (small.txt) =======\n');

  // Benchmark standard server with small file
  console.log('\n--- Standard Server ---\n');
  await runBenchmark('http://localhost:3001/small.txt', 100, 10);

  // Benchmark optimized server with small file
  console.log('\n--- Optimized Server with Buffer Pooling ---\n');
  await runBenchmark('http://localhost:3000/small.txt', 100, 10);

  console.log('\n======= BENCHMARKING MEDIUM FILE (medium.html) =======\n');

  // Benchmark standard server with medium file
  console.log('\n--- Standard Server ---\n');
  await runBenchmark('http://localhost:3001/medium.html', 100, 10);

  // Benchmark optimized server with medium file
  console.log('\n--- Optimized Server with Buffer Pooling ---\n');
  await runBenchmark('http://localhost:3000/medium.html', 100, 10);

  console.log('\n======= BENCHMARKING LARGE FILE (large.json) =======\n');

  // Benchmark standard server with large file
  console.log('\n--- Standard Server ---\n');
  await runBenchmark('http://localhost:3001/large.json', 50, 10);

  // Benchmark optimized server with large file
  console.log('\n--- Optimized Server with Buffer Pooling ---\n');
  await runBenchmark('http://localhost:3000/large.json', 50, 10);

  console.log('\n======= BENCHMARKING HUGE FILE (huge.bin) =======\n');

  // Benchmark standard server with huge file
  console.log('\n--- Standard Server ---\n');
  await runBenchmark('http://localhost:3001/huge.bin', 10, 30);

  // Benchmark optimized server with huge file
  console.log('\n--- Optimized Server with Buffer Pooling ---\n');
  await runBenchmark('http://localhost:3000/huge.bin', 10, 30);

  // Close servers
  standardServer.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
