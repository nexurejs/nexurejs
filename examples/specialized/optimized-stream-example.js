/**
 * Optimized Stream Processing Example
 *
 * This example demonstrates how to use the optimized stream processing
 * capabilities in Nexure.js to efficiently handle and transform data.
 */

import { createServer } from 'node:http';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createWriteStream, readFileSync, promises as fsPromises } from 'node:fs';

// Import optimized streaming components
import { BufferPool, globalPool } from '../src/utils/buffer-pool.js';
import {
  createOptimizedTransform,
  createJsonTransformer,
  createTextTransformer,
  createBufferedTransformer
} from '../src/utils/stream-optimizer.js';

// Create a simple HTTP server
const server = createServer(async (req, res) => {
  try {
    // Log incoming request
    console.log(`Request: ${req.method} ${req.url}`);

    // Get route path
    const path = req.url.split('?')[0];

    // Handle different routes to demonstrate various stream processing examples
    switch (path) {
      case '/json-transform':
        await handleJsonTransform(req, res);
        break;

      case '/text-transform':
        await handleTextTransform(req, res);
        break;

      case '/binary-transform':
        await handleBinaryTransform(req, res);
        break;

      case '/upload':
        await handleUpload(req, res);
        break;

      case '/stream-array':
        await handleStreamArray(req, res);
        break;

      case '/buffer-stats':
        handleBufferStats(req, res);
        break;

      default:
        await handleHome(req, res);
        break;
    }
  } catch (err) {
    console.error('Error handling request:', err);

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
});

/**
 * Handle JSON transformation example
 */
async function handleJsonTransform(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });

  // Create a JSON transformer that adds metadata
  const jsonTransformer = createJsonTransformer({
    processJson: (data) => {
      // Add processing metadata
      data.processed = true;
      data.timestamp = new Date().toISOString();
      data.server = 'Nexure Optimized Streams';

      // Return transformed data
      return data;
    }
  });

  try {
    // Process the request stream through our transformer and to the response
    await pipeline(
      req,
      jsonTransformer,
      res
    );

    console.log('JSON transformation completed successfully');
  } catch (err) {
    console.error('Error in JSON transformation:', err);
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: 'Error processing JSON' }));
    }
  }
}

/**
 * Handle text transformation example
 */
async function handleTextTransform(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });

  // Create a text transformer - uppercase and reverse text
  const textTransformer = createTextTransformer({
    processText: (text) => {
      // Uppercase the text
      const upperText = text.toUpperCase();

      // Add a processing indicator
      return `*** PROCESSED BY NEXURE ***\n${upperText}\n*** END OF PROCESSING ***`;
    }
  });

  try {
    // Process the request stream through our transformer and to the response
    await pipeline(
      req,
      textTransformer,
      res
    );

    console.log('Text transformation completed successfully');
  } catch (err) {
    console.error('Error in text transformation:', err);
    if (!res.writableEnded) {
      res.end('Error processing text');
    }
  }
}

/**
 * Handle binary transformation example
 */
async function handleBinaryTransform(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  res.writeHead(200, { 'Content-Type': 'application/octet-stream' });

  // Create a binary transformer with a simple XOR encryption
  const binaryTransformer = createBufferedTransformer({
    processChunk: (chunk, outputBuffer) => {
      // XOR each byte with 0x42 (simple encryption/decryption)
      for (let i = 0; i < chunk.length; i++) {
        outputBuffer[i] = chunk[i] ^ 0x42;
      }

      return { bytesWritten: chunk.length };
    }
  });

  try {
    // Process the request stream through our transformer and to the response
    await pipeline(
      req,
      binaryTransformer,
      res
    );

    console.log('Binary transformation completed successfully');
  } catch (err) {
    console.error('Error in binary transformation:', err);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Handle file upload example with progress tracking
 */
async function handleUpload(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });

  // Create a temporary file path
  const filePath = join(process.cwd(), 'uploads', `upload-${Date.now()}.dat`);
  const fileStream = createWriteStream(filePath);

  // Create a progress tracker
  let totalBytes = 0;
  const progressTracker = createOptimizedTransform({
    transform(chunk, encoding, callback) {
      totalBytes += chunk.length;

      // Log progress every 1MB
      if (totalBytes % (1024 * 1024) < chunk.length) {
        console.log(`Upload progress: ${Math.floor(totalBytes / (1024 * 1024))}MB`);
      }

      // Forward the chunk
      this.push(chunk);
      callback();
    }
  });

  try {
    // Process the upload
    await pipeline(
      req,
      progressTracker,
      fileStream
    );

    // Send success response
    const response = {
      success: true,
      filePath,
      size: totalBytes,
      sizeFormatted: formatBytes(totalBytes)
    };

    res.end(JSON.stringify(response));
    console.log(`Upload completed: ${response.sizeFormatted}`);
  } catch (err) {
    console.error('Error processing upload:', err);
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: 'Error processing upload' }));
    }
  }
}

/**
 * Handle streaming array example - processing JSON array items incrementally
 */
async function handleStreamArray(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });

  // Start the response as a JSON array
  res.write('[\n');

  // Track if we've written any items yet
  let itemCount = 0;

  // Create an array streaming JSON transformer
  const arrayProcessor = createJsonTransformer({
    streamArrayItems: true,
    processJson: (item) => {
      // Process each array item
      item.processed = true;
      item.sequence = ++itemCount;

      // Forward to output - with commas between items
      const output = (itemCount > 1 ? ',\n' : '') + JSON.stringify(item);
      return output;
    }
  });

  // Create a pass-through for the response
  const passThrough = new PassThrough();

  // Pipe array processor to pass-through
  arrayProcessor.pipe(passThrough);

  // Handle end of processing
  passThrough.on('end', () => {
    // Close the JSON array
    if (!res.writableEnded) {
      res.write('\n]');
      res.end();
    }

    console.log(`Completed streaming array processing: ${itemCount} items`);
  });

  try {
    // Process input stream
    await pipeline(
      req,
      arrayProcessor
    );

    // Pipe from pass-through to response
    passThrough.pipe(res);
  } catch (err) {
    console.error('Error in array streaming:', err);

    // Close the JSON array on error
    if (!res.writableEnded) {
      res.write('\n]');
      res.end();
    }
  }
}

/**
 * Show buffer pool statistics
 */
function handleBufferStats(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });

  // Get stats from the global buffer pool
  const stats = globalPool.getStats();

  // Calculate efficiency percentage
  stats.efficiencyPercentage = stats.efficiency ? (stats.efficiency * 100).toFixed(2) + '%' : 'N/A';

  // Add formatted sizes
  stats.totalAllocatedFormatted = formatBytes(stats.totalAllocated || 0);

  // Send the stats
  res.end(JSON.stringify(stats, null, 2));
}

/**
 * Home page showing available endpoints
 */
async function handleHome(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html' });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Nexure.js Optimized Stream Processing Demo</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        h2 { color: #555; margin-top: 30px; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }
        .endpoint { background: #e9f7ff; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
        .method { font-weight: bold; color: #0066cc; }
      </style>
    </head>
    <body>
      <h1>Nexure.js Optimized Stream Processing Demo</h1>
      <p>This server demonstrates the optimized stream processing capabilities in Nexure.js.</p>

      <h2>Available Endpoints</h2>

      <div class="endpoint">
        <p><span class="method">POST</span> /json-transform</p>
        <p>Transforms JSON data by adding metadata.</p>
        <pre>curl -X POST -H "Content-Type: application/json" -d '{"name":"test"}' http://localhost:3000/json-transform</pre>
      </div>

      <div class="endpoint">
        <p><span class="method">POST</span> /text-transform</p>
        <p>Transforms text data by converting to uppercase and adding headers.</p>
        <pre>curl -X POST -H "Content-Type: text/plain" -d "Hello, world!" http://localhost:3000/text-transform</pre>
      </div>

      <div class="endpoint">
        <p><span class="method">POST</span> /binary-transform</p>
        <p>Transforms binary data using XOR encryption.</p>
        <pre>curl -X POST -H "Content-Type: application/octet-stream" --data-binary @somefile.bin http://localhost:3000/binary-transform > transformed.bin</pre>
      </div>

      <div class="endpoint">
        <p><span class="method">POST</span> /upload</p>
        <p>Uploads a file with progress tracking.</p>
        <pre>curl -X POST -H "Content-Type: application/octet-stream" --data-binary @largefile.dat http://localhost:3000/upload</pre>
      </div>

      <div class="endpoint">
        <p><span class="method">POST</span> /stream-array</p>
        <p>Processes a JSON array incrementally, item by item.</p>
        <pre>curl -X POST -H "Content-Type: application/json" -d '[{"id":1},{"id":2},{"id":3}]' http://localhost:3000/stream-array</pre>
      </div>

      <div class="endpoint">
        <p><span class="method">GET</span> /buffer-stats</p>
        <p>Shows current buffer pool statistics.</p>
        <pre>curl http://localhost:3000/buffer-stats</pre>
      </div>

      <h2>Buffer Pool Performance</h2>
      <p>The buffer pool significantly reduces memory allocations by reusing buffers. Check the /buffer-stats endpoint to see efficiency metrics.</p>
    </body>
    </html>
  `;

  res.end(html);
}

/**
 * Method not allowed response
 */
function methodNotAllowed(res) {
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

/**
 * Format bytes to a human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Optimized stream processing demo server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /json-transform - Transform JSON data');
  console.log('  POST /text-transform - Transform text data');
  console.log('  POST /binary-transform - Transform binary data with XOR');
  console.log('  POST /upload - Upload file with progress tracking');
  console.log('  POST /stream-array - Process JSON array incrementally');
  console.log('  GET /buffer-stats - Show buffer pool statistics');
});
