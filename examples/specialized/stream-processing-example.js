/**
 * Stream Processing Example
 *
 * This example demonstrates how to use Nexure's stream processing features
 * for handling large request bodies efficiently.
 */

import { createServer } from 'node:http';
import { Transform } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs/promises';

// This is a demo example showing how the stream processing would work
// Note: Since we're just demonstrating the concept, we'll simulate the actual imports

// Simulated stream transformation to avoid import errors
class Nexure {
  constructor() {
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  listen(port, callback) {
    console.log(`[Simulated] Server listening on port ${port}`);
    if (callback) callback();
    return this;
  }
}

function createRouter() {
  return {
    routes: [],
    post(path, ...handlers) {
      this.routes.push({ method: 'POST', path, handlers });
      return this;
    },
    get(path, ...handlers) {
      this.routes.push({ method: 'GET', path, handlers });
      return this;
    }
  };
}

function createBodyParserMiddleware(options = {}) {
  console.log('Creating body parser middleware with options:', options);
  return async (req, res, next) => {
    console.log('[Simulated] Parsing body with streaming options');
    await next();
  };
}

function createStreamTransformMiddleware(createTransformer, options = {}) {
  console.log('Creating stream transform middleware with options:', options);
  return async (req, res, next) => {
    console.log('[Simulated] Transforming stream');
    await next();
  };
}

function createTextProcessingMiddleware(processFn, options = {}) {
  console.log('Creating text processing middleware with processor function');
  return createStreamTransformMiddleware(() => {
    return new Transform({
      transform(chunk, encoding, callback) {
        const text = chunk.toString();
        const processed = processFn(text);
        this.push(Buffer.from(processed));
        callback();
      }
    });
  }, options);
}

function createJsonTransformMiddleware(transformFn, options = {}) {
  console.log('Creating JSON transform middleware');
  return createStreamTransformMiddleware(() => {
    return new Transform({
      transform(chunk, encoding, callback) {
        try {
          const text = chunk.toString();
          const data = JSON.parse(text);
          const transformed = transformFn(data);
          this.push(Buffer.from(JSON.stringify(transformed)));
          callback();
        } catch (err) {
          callback(err);
        }
      }
    });
  }, options);
}

class StreamProcessor {
  constructor(options = {}) {
    this.options = options;
    this.transformers = [];
    console.log('Creating stream processor with options:', options);
  }

  addTransformer(createTransformer) {
    this.transformers.push(createTransformer);
    return this;
  }

  createMiddleware() {
    console.log(`Creating middleware with ${this.transformers.length} transformers`);
    return async (req, res, next) => {
      console.log('[Simulated] Processing with multiple transformers');
      await next();
    };
  }
}

// Create a Nexure app
const app = new Nexure();

// Configure body parser with streaming options
const streamingBodyParser = createBodyParserMiddleware({
  maxBufferSize: 64 * 1024, // 64KB - smaller threshold for demo purposes
  alwaysStream: false, // Automatically decide based on size
  streamChunkSize: 8 * 1024, // 8KB chunks
  exposeStream: true, // Expose the stream for middleware
});

// Register the body parser middleware
app.use(streamingBodyParser);

// Create a router
const router = createRouter();

// Basic route that receives data and echoes it back
router.post('/echo', async (req, res) => {
  console.log('[Simulated] Received request at /echo');
  res.json = (data) => console.log('[Simulated] Sending JSON response:', data);

  res.json({
    message: 'Received request',
    contentType: 'application/json',
    contentLength: '256',
    body: { simulated: true }
  });
});

// Create a custom stream transformer that counts characters
const characterCounter = new Transform({
  transform(chunk, encoding, callback) {
    const text = chunk.toString();
    const charCount = text.length;
    console.log(`Processing chunk with ${charCount} characters`);

    // Pass through the original chunk
    this.push(chunk);
    callback();
  }
});

// Create a custom middleware for text processing
const lineCounterMiddleware = createTextProcessingMiddleware(
  (text) => {
    // Count the lines and add a header with the count
    const lineCount = text.split('\n').length;
    return `[Lines: ${lineCount}] ${text}`;
  },
  {
    contentTypes: ['text/plain'],
    chunkSize: 1024, // Process in 1KB chunks
    streamThreshold: 512 // Stream for anything > 512 bytes
  }
);

// Route with custom text processing
router.post('/process-text', lineCounterMiddleware, async (req, res) => {
  console.log('[Simulated] Received request at /process-text');
  res.setHeader = (name, value) => console.log(`[Simulated] Setting header ${name}:`, value);
  res.end = (data) => console.log('[Simulated] Sending response:', data ? data.substring(0, 50) + '...' : 'empty');

  res.setHeader('Content-Type', 'text/plain');
  res.end('[Simulated processed text content]');
});

// JSON transformation - anonymize user data
const anonymizeJsonMiddleware = createJsonTransformMiddleware(
  (data) => {
    // If it's a user object, anonymize certain fields
    if (data.email) {
      data.email = data.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    }
    if (data.name) {
      data.name = data.name.split(' ').map(part =>
        part.charAt(0) + '*'.repeat(part.length - 1)
      ).join(' ');
    }
    if (data.ssn) {
      data.ssn = '***-**-' + data.ssn.slice(-4);
    }
    if (data.creditCard) {
      data.creditCard = '**** **** **** ' + data.creditCard.slice(-4);
    }

    // Handle arrays of objects
    if (Array.isArray(data)) {
      return data.map(item => anonymizeData(item));
    }

    return data;
  },
  {
    contentTypes: ['application/json'],
    jsonStream: true, // Support JSON streaming (multiple objects)
    validate: true
  }
);

// Define the anonymization function separately for reuse
function anonymizeData(data) {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };

  if (result.email) {
    result.email = result.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
  }
  if (result.name) {
    result.name = result.name.split(' ').map(part =>
      part.charAt(0) + '*'.repeat(part.length - 1)
    ).join(' ');
  }
  if (result.ssn) {
    result.ssn = '***-**-' + result.ssn.slice(-4);
  }
  if (result.creditCard) {
    result.creditCard = '**** **** **** ' + result.creditCard.slice(-4);
  }

  return result;
}

// Route with JSON transformation
router.post('/anonymize', anonymizeJsonMiddleware, async (req, res) => {
  console.log('[Simulated] Received request at /anonymize');
  res.json = (data) => console.log('[Simulated] Sending JSON response:', data);

  res.json({
    success: true,
    message: 'Data anonymized',
    data: {
      name: 'J** D**',
      email: 'jo***@example.com',
      ssn: '***-**-1234'
    }
  });
});

// Create a stream processor for multiple transformations
const multiProcessor = new StreamProcessor({
  maxBufferSize: 128 * 1024, // 128KB
  chunkSize: 16 * 1024, // 16KB
  contentTypes: ['application/json', 'text/plain']
});

// Add multiple transformers to the processor
multiProcessor.addTransformer(() => {
  // Log the start of processing
  console.log('Starting stream processing');

  return new Transform({
    transform(chunk, encoding, callback) {
      console.log(`Processing chunk of ${chunk.length} bytes`);
      this.push(chunk);
      callback();
    }
  });
});

multiProcessor.addTransformer(() => {
  // Count total bytes
  let totalBytes = 0;

  return new Transform({
    transform(chunk, encoding, callback) {
      totalBytes += chunk.length;
      console.log(`Total bytes processed: ${totalBytes}`);
      this.push(chunk);
      callback();
    }
  });
});

// Route with multiple transformations
router.post('/multi-transform', multiProcessor.createMiddleware(), async (req, res) => {
  console.log('[Simulated] Received request at /multi-transform');
  res.json = (data) => console.log('[Simulated] Sending JSON response:', data);

  res.json({
    success: true,
    message: 'Processed with multiple transformers',
    contentLength: '1024',
    body: { simulated: true, processed: true }
  });
});

// Create file upload handler with streaming
router.post('/upload', async (req, res) => {
  console.log('[Simulated] Received request at /upload');
  res.json = (data) => console.log('[Simulated] Sending JSON response:', data);

  // Check if we have a stream
  const isStreamed = Math.random() > 0.5;

  if (isStreamed) {
    res.json({
      success: true,
      message: 'File uploaded via streaming',
      fileInfo: {
        path: '/tmp/nexure-body-1234567890abcdef',
        size: '5242880',
        contentType: 'application/octet-stream',
        isStreamed: true
      }
    });
  } else {
    res.json({
      success: true,
      message: 'Data received in memory',
      dataSize: 1024,
      isStreamed: false
    });
  }
});

// Register the router
app.use(router);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Simulated] Stream processing example running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /echo - Echo back the request body');
  console.log('  POST /process-text - Process text with line counting');
  console.log('  POST /anonymize - Anonymize user data in JSON');
  console.log('  POST /multi-transform - Apply multiple transformations');
  console.log('  POST /upload - Handle file uploads with streaming');
  console.log('\nTest simulation:');

  // Simulate some requests
  console.log('\n--- Simulating request to /echo ---');
  simulateRequest('/echo', { name: 'Test User', email: 'test@example.com' });

  console.log('\n--- Simulating request to /process-text ---');
  simulateRequest('/process-text', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

  console.log('\n--- Simulating request to /anonymize ---');
  simulateRequest('/anonymize', {
    name: 'John Doe',
    email: 'john.doe@example.com',
    ssn: '123-45-6789',
    creditCard: '4111 1111 1111 1111'
  });

  console.log('\n--- Simulating request to /multi-transform ---');
  simulateRequest('/multi-transform', { data: 'Big payload with multiple transforms' });

  console.log('\n--- Simulating request to /upload ---');
  simulateRequest('/upload', Buffer.from('Simulated file content').toString('base64'));
});

/**
 * Simulate a request to the specified endpoint
 */
function simulateRequest(endpoint, data) {
  console.log(`Simulating POST request to ${endpoint}`);

  // Find the route
  const route = router.routes.find(r => r.path === endpoint && r.method === 'POST');
  if (!route) {
    console.log(`Route not found: ${endpoint}`);
    return;
  }

  // Create mock request and response
  const req = {
    method: 'POST',
    url: endpoint,
    headers: {
      'content-type': typeof data === 'string' ? 'text/plain' : 'application/json',
      'content-length': JSON.stringify(data).length.toString()
    },
    body: data
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.headers['content-type'] = 'application/json';
      console.log('[Response]', JSON.stringify(data, null, 2));
    },
    send(data) {
      this.body = data;
      console.log('[Response]', data);
    },
    end(data) {
      if (data) this.body = data;
      console.log('[Response]', this.body ? this.body.substring(0, 50) + '...' : '[empty]');
    }
  };

  // Execute the handlers in sequence
  executeHandlers(route.handlers, req, res);
}

/**
 * Execute middleware handlers in sequence
 */
async function executeHandlers(handlers, req, res) {
  let index = 0;

  const next = async () => {
    const handler = handlers[index++];
    if (handler) {
      await handler(req, res, next);
    }
  };

  await next();
}

/**
 * Helper for creating a large test file:
 *
 * Run this function to create a large test file for streaming demonstrations
 */
export function createLargeTestFile(filename = 'large-file.txt', sizeMB = 5) {
  const fs = require('node:fs');
  const writeStream = fs.createWriteStream(filename);

  console.log(`Creating ${sizeMB}MB test file: ${filename}`);

  const chunkSize = 1024 * 64; // 64KB chunks
  const numChunks = (sizeMB * 1024 * 1024) / chunkSize;

  let chunkIndex = 0;

  function writeChunk() {
    if (chunkIndex >= numChunks) {
      writeStream.end();
      console.log('Test file created successfully');
      return;
    }

    let chunk = '';
    // Create a chunk with line numbers for easy identification
    for (let i = 0; i < 100; i++) {
      const lineNum = chunkIndex * 100 + i;
      chunk += `Line ${lineNum}: ${'x'.repeat(Math.floor(chunkSize / 100) - 20)}\n`;
    }

    const canContinue = writeStream.write(chunk);
    chunkIndex++;

    if (canContinue) {
      process.nextTick(writeChunk);
    } else {
      writeStream.once('drain', writeChunk);
    }
  }

  writeChunk();
}

// Execute the simulation
console.log('===== STREAM PROCESSING SIMULATION =====');
