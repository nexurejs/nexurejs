/**
 * HTTP/2 Server Adapter
 *
 * This module provides an adapter for HTTP/2 servers.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Http2SecureServer, constants, createSecureServer } from 'node:http2';
import { Router } from '../routing/router.js';
import { MiddlewareHandler } from '../middleware/middleware.js';
import { Logger } from '../utils/logger.js';

/**
 * HTTP/2 Server Options
 */
export interface Http2ServerOptions {
  /**
   * Path to the SSL certificate
   */
  cert: string;

  /**
   * Path to the SSL key
   */
  key: string;

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
   * Enable push streams
   * @default false
   */
  enablePush?: boolean;
}

/**
 * HTTP/2 Request Adapter
 *
 * Adapts HTTP/2 streams to Node.js IncomingMessage
 */
class Http2RequestAdapter extends IncomingMessage {
  // Make stream property accessible to the response adapter
  public stream: any;

  constructor(socket: Socket, headers: Record<string, string | string[]>, stream: any) {
    super(socket);
    this.stream = stream;

    // Copy headers
    for (const [key, value] of Object.entries(headers)) {
      this.headers[key] = value;
    }

    // Set HTTP/2 specific properties
    this.httpVersionMajor = 2;
    this.httpVersionMinor = 0;
    this.httpVersion = '2.0';
    this.method = headers[':method'] as string;
    this.url = headers[':path'] as string;
  }
}

/**
 * HTTP/2 Response Adapter
 *
 * Adapts HTTP/2 streams to Node.js ServerResponse
 */
class Http2ResponseAdapter extends ServerResponse {
  private stream: any;

  constructor(req: Http2RequestAdapter) {
    super(req);
    this.stream = req.stream;
  }

  override writeHead(statusCode: number, statusMessage?: string | object, headers?: object): this {
    this.statusCode = statusCode;

    // Handle headers
    let headersObj: Record<string, any> = {};

    if (typeof statusMessage === 'object') {
      headersObj = statusMessage as Record<string, any>;
    } else if (headers) {
      headersObj = headers as Record<string, any>;
    }

    // Set status
    this.stream.respond({
      ':status': statusCode,
      ...headersObj
    });

    return this;
  }

  override end(
    chunk?: any,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): this {
    if (typeof encodingOrCallback === 'function') {
      callback = encodingOrCallback;
      encodingOrCallback = undefined;
    }

    // HTTP/2 requires respond() before a stream can be ended. Callers that set
    // res.statusCode directly (the router's auto-responder) never call
    // writeHead(), so emit the headers here if that has not happened yet.
    if (!this.stream.headersSent) {
      this.stream.respond({ ':status': this.statusCode || 200 });
    }

    if (chunk) {
      this.stream.end(chunk, encodingOrCallback as BufferEncoding);
    } else {
      this.stream.end();
    }

    if (callback) {
      callback();
    }

    return this;
  }

  override write(
    chunk: any,
    encodingOrCallback?: BufferEncoding | ((_error: Error | null | undefined) => void),
    _callback?: (_error: Error | null | undefined) => void
  ): boolean {
    if (typeof encodingOrCallback === 'function') {
      _callback = encodingOrCallback;
      encodingOrCallback = undefined;
    }

    return this.stream.write(chunk, encodingOrCallback as BufferEncoding, _callback);
  }
}

/**
 * HTTP/2 Server Adapter
 */
export class Http2ServerAdapter {
  private server: Http2SecureServer;
  private router: Router;
  private middlewares: MiddlewareHandler[] = [];
  private logger = new Logger();

  /**
   * Create a new HTTP/2 server adapter
   * @param options HTTP/2 server options
   * @param router Router instance
   */
  constructor(options: Http2ServerOptions, router: Router) {
    this.router = router;

    // Create HTTP/2 server
    this.server = createSecureServer({
      key: options.key,
      cert: options.cert,
      allowHTTP1: options.allowHttp1 !== false,
      settings: {
        [constants.NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS]: options.maxConcurrentStreams || 100,
        [constants.NGHTTP2_SETTINGS_ENABLE_PUSH]: options.enablePush ? 1 : 0
      }
    });

    // Handle streams
    this.server.on('stream', this.handleStream.bind(this));

    // Handle server-level errors (no stream to respond to — log only).
    this.server.on('error', (error: Error) => {
      this.logger.error('HTTP/2 server error:', error);
    });
  }

  /**
   * Add middleware to the server
   * @param middleware Middleware handler
   */
  use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Start listening on the specified port
   * @param port Port to listen on
   * @param callback Callback to call when server is listening
   */
  listen(port: number, callback?: () => void): Http2SecureServer {
    this.server.listen(port, callback);
    return this.server;
  }

  /**
   * Handle HTTP/2 stream
   * @param stream HTTP/2 stream
   * @param headers HTTP/2 headers
   */
  private async handleStream(stream: any, headers: any): Promise<void> {
    try {
      // Create socket (dummy for compatibility)
      const socket = new Socket();

      // Create request and response adapters
      const req = new Http2RequestAdapter(socket, headers, stream);
      const res = new Http2ResponseAdapter(req);

      // Process middleware
      let middlewareIndex = 0;

      const next = async (): Promise<void> => {
        if (middlewareIndex < this.middlewares.length) {
          const middleware = this.middlewares[middlewareIndex++]!;
          await middleware(req, res, next);
        } else {
          // Process the route after all middleware has run
          await this.router.process(req, res);
        }
      };

      await next();
    } catch (error) {
      // Respond to the stream so the request does not hang — logging alone
      // would leave the client waiting indefinitely.
      this.logger.error('HTTP/2 stream error:', error);
      try {
        if (!stream.headersSent && !stream.closed) {
          const statusCode = (error as { statusCode?: number }).statusCode || 500;
          stream.respond({ ':status': statusCode, 'content-type': 'application/json' });
          stream.end(
            JSON.stringify({
              statusCode,
              message: (error as Error).message || 'Internal Server Error'
            })
          );
        } else if (!stream.closed) {
          stream.end();
        }
      } catch {
        // The stream is already torn down — nothing more can be done.
      }
    }
  }

  /**
   * Close the server
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
