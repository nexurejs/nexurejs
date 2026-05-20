/**
 * HTTP/2 Protocol Adapter
 *
 * This module provides an adapter between the framework's request/response
 * abstractions and the native HTTP/2 protocol implementation.
 */

import * as http2 from 'node:http2';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { logger } from '../utils/logger.js';

/**
 * Object pool for reusing objects
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void) {
    this.factory = factory;
    this.reset = reset;
  }

  /**
   * Acquire an object from the pool or create a new one
   */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }
}

/**
 * Create a pool of IncomingMessage objects
 */
export function createRequestPool(): ObjectPool<IncomingMessage> {
  return new ObjectPool<IncomingMessage>(
    () => Object.create(IncomingMessage.prototype) as IncomingMessage,
    req => {
      // Reset request properties
      req.url = '';
      req.method = '';
      req.headers = {};
      req.rawHeaders = [];
      req.httpVersionMajor = 2;
      req.httpVersionMinor = 0;
      req.httpVersion = '2.0';
    }
  );
}

// HTTP/2 specific constants
const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS, HTTP2_HEADER_CONTENT_LENGTH } =
  http2.constants;

/**
 * HTTP/2 Server configuration
 */
export interface Http2Options {
  /**
   * Path to the SSL key
   */
  key?: Buffer | string;

  /**
   * Path to the SSL certificate
   */
  cert?: Buffer | string;

  /**
   * Whether to allow HTTP/1 connections
   * @default true
   */
  allowHttp1?: boolean;

  /**
   * Maximum concurrent streams per connection
   * @default 100
   */
  maxConcurrentStreams?: number;

  /**
   * Additional HTTP/2 server options
   */
  serverOptions?: http2.SecureServerOptions;
}

/**
 * Create an HTTP/2 server with compatibility for HTTP/1
 */
export function createHttp2Server(
  options: Http2Options,
  requestHandler: (req: IncomingMessage, res: ServerResponse) => void
): http2.Http2SecureServer {
  // Create request and response object pools for reuse
  const requestPool = createRequestPool();
  const responsePool = new ObjectPool<ServerResponse>(
    () => Object.create(ServerResponse.prototype) as ServerResponse,
    res => {
      // Reset response properties
      res.statusCode = 200;
      res.statusMessage = '';

      // Clear headers
      for (const name of Object.keys(res.getHeaders())) {
        res.removeHeader(name);
      }
    }
  );

  // Default options
  const serverOptions: http2.SecureServerOptions = {
    allowHTTP1: options.allowHttp1 !== false,
    ...options.serverOptions
  };

  // Add max concurrent streams if specified
  if (options.maxConcurrentStreams) {
    serverOptions.settings = {
      ...serverOptions.settings,
      [http2.constants.NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS]: options.maxConcurrentStreams
    };
  }

  // Add SSL certificates if provided
  if (options.key && options.cert) {
    serverOptions.key = options.key;
    serverOptions.cert = options.cert;
  }

  // Create HTTP/2 server
  const server = http2.createSecureServer(serverOptions);

  // Handle HTTP/2 streams
  server.on('stream', (stream, headers) => {
    // Create request and response objects
    const req = requestPool.acquire();
    const res = responsePool.acquire();

    // Set up request and response
    setupRequest(req, stream, headers);
    setupResponse(res, stream, () => {
      responsePool.release(res);
      requestPool.release(req);
    });

    // Handle stream events
    handleStreamEvents(stream, req, res, responsePool, requestPool);

    // Handle request
    requestHandler(req, res);
  });

  // Handle HTTP/1 connections (if enabled)
  if (options.allowHttp1 !== false) {
    server.on('request', requestHandler);
  }

  return server;
}

/**
 * Set up the request object for HTTP/2
 */
function setupRequest(
  req: IncomingMessage,
  stream: http2.ServerHttp2Stream,
  headers: http2.IncomingHttpHeaders
): void {
  // Initialize request properties
  req.method = headers[http2.constants.HTTP2_HEADER_METHOD] as string;
  req.url = headers[http2.constants.HTTP2_HEADER_PATH] as string;
  req.headers = {};

  // Convert HTTP/2 headers to HTTP/1 style
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith(':')) continue; // Skip HTTP/2 pseudo headers

    // Handle multiple header values
    if (Array.isArray(value)) {
      req.headers[name] = value.join(', ');
    } else if (typeof value === 'string') {
      req.headers[name] = value;
    }
  }

  // Set up request callbacks
  req.on = (event: string, callback: (...args: any[]) => void): IncomingMessage => {
    if (event === 'data') {
      stream.on('data', callback);
    } else if (event === 'end') {
      stream.on('end', callback);
    } else if (event === 'error') {
      stream.on('error', callback);
    }
    return req;
  };

  // Set up request socket for compatibility
  const socketObj: Partial<Socket> = {
    remoteAddress: stream.session?.socket.remoteAddress,
    remotePort: stream.session?.socket.remotePort
  };
  req.socket = socketObj as Socket;
}

/**
 * Set up the response object for HTTP/2
 */
function setupResponse(
  res: ServerResponse,
  stream: http2.ServerHttp2Stream,
  releaseResources: () => void
): void {
  // Initialize response properties
  res.statusCode = http2.constants.HTTP_STATUS_OK;

  // Add custom properties to response
  const customRes = res as ServerResponse & {
    _headers: Record<string, string | string[]>;
    _headersSent: boolean;
  };
  customRes._headers = {};
  customRes._headersSent = false;

  // Override response methods
  res.setHeader = (name: string, value: string | string[]): ServerResponse => {
    if (stream.destroyed) return res;

    // Skip HTTP/1 specific headers
    if (
      name.toLowerCase() === 'connection' ||
      name.toLowerCase() === 'transfer-encoding' ||
      name.toLowerCase() === 'keep-alive'
    ) {
      return res;
    }

    // Store headers for getHeaders()
    if (!customRes._headersSent) {
      customRes._headers[name.toLowerCase()] = value;
    }

    return res;
  };

  res.getHeaders = (): Record<string, string | string[]> => {
    return customRes._headers;
  };

  res.removeHeader = (name: string): ServerResponse => {
    if (!customRes._headersSent) {
      delete customRes._headers[name.toLowerCase()];
    }
    return res;
  };

  res.writeHead = (
    statusCode: number,
    statusMessage?: string | any,
    headers?: any
  ): ServerResponse => {
    if (stream.destroyed) return res;

    res.statusCode = statusCode;

    // Handle optional statusMessage
    if (statusMessage !== undefined && typeof statusMessage === 'object') {
      headers = statusMessage;
      statusMessage = undefined;
    }

    // Add headers
    if (headers && typeof headers === 'object') {
      for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value as any);
      }
    }

    return res;
  };

  res.write = (
    chunk: any,
    encoding?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void
  ): boolean => {
    if (stream.destroyed) return false;

    // Handle optional encoding
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    // Send headers if not already sent
    if (!customRes._headersSent) {
      const headers: Record<string, string | string[]> = {
        [http2.constants.HTTP2_HEADER_STATUS]: res.statusCode.toString()
      };

      // Add response headers
      for (const [name, value] of Object.entries(res.getHeaders())) {
        headers[name] = value as string | string[];
      }

      try {
        stream.respond(headers, { endStream: false });
        customRes._headersSent = true;
        // Using Object.defineProperty to avoid the read-only error
        Object.defineProperty(res, 'headersSent', { value: true });
      } catch (err) {
        if (callback) callback(err as Error);
        return false;
      }
    }

    // Send data
    try {
      // Cast callback to the expected type
      const typedCallback = callback as ((error: Error | null | undefined) => void) | undefined;
      const result = stream.write(chunk, encoding as BufferEncoding, typedCallback);
      return result;
    } catch (err) {
      if (callback) callback(err as Error);
      return false;
    }
  };

  res.end = (
    chunk?: any,
    encoding?: BufferEncoding | (() => void),
    callback?: () => void
  ): ServerResponse => {
    if (stream.destroyed) return res;

    // Handle optional chunk and encoding
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
      encoding = undefined;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    // Send headers if not already sent
    if (!customRes._headersSent) {
      const headers: Record<string, string | string[]> = {
        [http2.constants.HTTP2_HEADER_STATUS]: res.statusCode.toString()
      };

      // Add response headers
      for (const [name, value] of Object.entries(res.getHeaders())) {
        headers[name] = value as string | string[];
      }

      try {
        stream.respond(headers, { endStream: !chunk });
        customRes._headersSent = true;
        // Using Object.defineProperty to avoid the read-only error
        Object.defineProperty(res, 'headersSent', { value: true });
      } catch (_err) {
        if (callback) callback();
        stream.destroy();
        return res;
      }
    }

    // Send data and end stream
    if (chunk) {
      try {
        stream.end(chunk, encoding as BufferEncoding, callback);
      } catch (_err) {
        if (callback) callback();
        stream.destroy();
      }
    } else {
      try {
        stream.end(callback);
      } catch (_err) {
        if (callback) callback();
        stream.destroy();
      }
    }

    // Return response to the pool
    process.nextTick(releaseResources);

    return res;
  };
}

/**
 * Handle HTTP/2 stream events
 */
function handleStreamEvents(
  stream: http2.ServerHttp2Stream,
  req: IncomingMessage,
  res: ServerResponse,
  responsePool: ObjectPool<ServerResponse>,
  requestPool: ObjectPool<IncomingMessage>
): void {
  const customRes = res as ServerResponse & {
    _headersSent: boolean;
  };

  stream.on('error', err => {
    (req as any).emit('error', err);
    stream.destroy();

    // Return objects to pool
    responsePool.release(res);
    requestPool.release(req);
  });

  stream.on('close', () => {
    // Return objects to pool if not already returned
    if (!customRes._headersSent) {
      responsePool.release(res);
      requestPool.release(req);
    }
  });
}

/**
 * Create an HTTP/2 client
 */
export function createHttp2Client(options: {
  url: string;
  timeout?: number;
  maxConcurrentStreams?: number;
}): http2.ClientHttp2Session {
  const clientOptions: http2.ClientSessionOptions = {};

  // Set max concurrent streams if specified
  if (options.maxConcurrentStreams) {
    clientOptions.settings = {
      [http2.constants.NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS]: options.maxConcurrentStreams
    };
  }

  const client = http2.connect(options.url, clientOptions);

  // Set default timeout
  if (options.timeout) {
    client.setTimeout(options.timeout);
  }

  // Handle connection errors
  client.on('error', err => {
    logger.error('HTTP/2 client error:', err);
  });

  return client;
}

/**
 * Check if HTTP/2 is supported in the runtime
 */
export function isHttp2Supported(): boolean {
  return typeof http2.createServer === 'function';
}

/**
 * Create an HTTP/2 request stream
 */
export async function http2Request(
  client: http2.ClientHttp2Session,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    timeout?: number;
  }
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      [HTTP2_HEADER_METHOD]: options.method,
      [HTTP2_HEADER_PATH]: options.path,
      ...options.headers
    };

    // Add content length if body is provided
    if (options.body) {
      headers[HTTP2_HEADER_CONTENT_LENGTH] = Buffer.byteLength(options.body).toString();
    }

    // Create request stream
    const req = client.request(headers);

    // Set timeout
    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        reject(new Error('HTTP/2 request timeout'));
      });
    }

    // Handle response
    const responseChunks: Buffer[] = [];
    let responseHeaders: Record<string, string> = {};
    let status = 200;

    req.on('response', headers => {
      responseHeaders = {};

      // Convert HTTP/2 headers to HTTP/1 style
      for (const [name, value] of Object.entries(headers)) {
        if (name === HTTP2_HEADER_STATUS) {
          status = parseInt(value as string, 10);
        } else if (!name.startsWith(':')) {
          // Skip HTTP/2 pseudo headers
          responseHeaders[name] = value as string;
        }
      }
    });

    req.on('data', chunk => {
      responseChunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      resolve({
        status,
        headers: responseHeaders,
        body: Buffer.concat(responseChunks)
      });
    });

    req.on('error', reject);

    // Send request body
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}
