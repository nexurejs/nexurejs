/**
 * Static File Server Example
 *
 * This example shows how to use the optimized static file middleware
 * with buffer reuse and LRU caching for improved performance.
 */

import { Nexure } from '../src/core/nexure.js';
import { createStaticMiddleware } from '../src/middleware/static-files.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = new URL('.', import.meta.url).pathname;

// Create static file directory for testing
const STATIC_DIR = join(__dirname, 'public');

// Create sample files for testing
async function createSampleFiles() {
  // Create directory if it doesn't exist
  await fs.mkdir(STATIC_DIR, { recursive: true });

  // Create a small text file
  await fs.writeFile(join(STATIC_DIR, 'small.txt'), 'This is a small text file for testing the static file server.');

  // Create a medium HTML file
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Static File Server Example</title>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { color: #333; }
    .card { border: 1px solid #ddd; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; }
    .info { background-color: #f0f8ff; }
  </style>
</head>
<body>
  <h1>Static File Server Example</h1>
  <div class="card info">
    <h2>Features</h2>
    <ul>
      <li>Buffer pooling for efficient memory usage</li>
      <li>LRU caching for frequently accessed files</li>
      <li>Streaming for large files with buffer recycling</li>
      <li>Content-Type detection</li>
      <li>ETag and conditional requests support</li>
      <li>Range requests support</li>
    </ul>
  </div>
  <div class="card">
    <h2>Links</h2>
    <ul>
      <li><a href="/small.txt">Small Text File</a></li>
      <li><a href="/medium.html">Medium HTML File (this file)</a></li>
      <li><a href="/large.json">Large JSON File</a></li>
      <li><a href="/huge.bin">Huge Binary File</a></li>
    </ul>
  </div>
</body>
</html>
  `;
  await fs.writeFile(join(STATIC_DIR, 'medium.html'), html);

  // Create a large JSON file
  const largeData = {
    title: 'Large JSON Data',
    description: 'This is a large JSON file for testing streaming and buffer reuse',
    items: []
  };

  // Add 10,000 items to make it large
  for (let i = 0; i < 10000; i++) {
    largeData.items.push({
      id: i,
      name: `Item ${i}`,
      value: Math.random() * 1000,
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
    });
  }

  await fs.writeFile(join(STATIC_DIR, 'large.json'), JSON.stringify(largeData, null, 2));

  // Create a huge binary file (20MB)
  const hugeFile = createWriteStream(join(STATIC_DIR, 'huge.bin'));
  const chunkSize = 64 * 1024; // 64KB chunks
  const numChunks = (20 * 1024 * 1024) / chunkSize; // 20MB total

  for (let i = 0; i < numChunks; i++) {
    const buffer = Buffer.alloc(chunkSize);
    // Fill with random data
    for (let j = 0; j < chunkSize; j++) {
      buffer[j] = Math.floor(Math.random() * 256);
    }
    hugeFile.write(buffer);
  }

  return new Promise((resolve) => {
    hugeFile.end(() => {
      console.log('Sample files created.');
      resolve();
    });
  });
}

// Start the server
async function startServer() {
  try {
    // Create sample files
    await createSampleFiles();

    // Create Nexure instance
    const app = new Nexure();

    // Create static file middleware with buffer pooling
    const staticMiddleware = createStaticMiddleware({
      root: STATIC_DIR,
      prefix: '/',
      maxCacheSize: 10 * 1024 * 1024, // 10MB cache
      maxFileSizeToCache: 1 * 1024 * 1024, // Cache files up to 1MB
      bufferSize: 64 * 1024, // 64KB buffer size
      maxBufferPoolSize: 10 * 1024 * 1024, // 10MB buffer pool
      etag: true,
      lastModified: true,
      cacheControl: 'public, max-age=3600', // 1 hour cache
      directoryListing: true
    });

    // Add middleware
    app.use(staticMiddleware);

    // Get server stats endpoint
    app.use(async (req, res, next) => {
      if (req.url === '/stats') {
        const middleware = new (staticMiddleware.constructor)({
          root: STATIC_DIR,
          prefix: '/'
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          cacheStats: middleware.getCacheStats ? middleware.getCacheStats() : 'Not available',
          memory: process.memoryUsage(),
          uptime: process.uptime()
        }, null, 2));
        return;
      }

      await next();
    });

    // Start the server
    const server = await app.listen(3000);
    console.log('Server running at http://localhost:3000/');
    console.log('Available routes:');
    console.log('  - /                (Directory listing)');
    console.log('  - /small.txt       (Small text file)');
    console.log('  - /medium.html     (Medium HTML file)');
    console.log('  - /large.json      (Large JSON file)');
    console.log('  - /huge.bin        (Huge binary file)');
    console.log('  - /stats           (Server stats)');

    // Monitor memory usage
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      console.log(`Memory Usage - RSS: ${formatBytes(memoryUsage.rss)}, Heap: ${formatBytes(memoryUsage.heapUsed)}/${formatBytes(memoryUsage.heapTotal)}`);
    }, 10000);

    return server;
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Format bytes to human readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Create a standalone HTTP server if this is the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export { startServer };
