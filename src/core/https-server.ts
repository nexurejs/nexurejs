/**
 * HTTPS server implementation for secure communications
 */

import { createServer, Server } from 'node:https';
import { IncomingMessage, ServerResponse } from 'node:http';
import { SecureVersion } from 'node:tls';
import { readFileSync } from 'node:fs';
import { MiddlewareHandler } from '../middleware/middleware.js';
import { Router } from '../routing/router.js';
import { Logger } from '../utils/logger.js';

/**
 * HTTPS server options
 */
export interface HttpsServerOptions {
  /**
   * Path to the SSL certificate
   */
  cert: string;

  /**
   * Path to the SSL key
   */
  key: string;

  /**
   * Path to the CA certificate
   */
  ca?: string;

  /**
   * Whether to request client certificate
   * @default false
   */
  requestCert?: boolean;

  /**
   * Whether to reject unauthorized clients
   * @default true
   */
  rejectUnauthorized?: boolean;

  /**
   * Minimum TLS version
   * @default 'TLSv1.2'
   */
  minVersion?: SecureVersion;

  /**
   * Maximum TLS version
   */
  maxVersion?: SecureVersion;

  /**
   * Cipher suites to use
   */
  ciphers?: string;
}

/**
 * HTTPS server implementation
 */
export class HttpsServerAdapter {
  private server: Server;
  private router: Router;
  private middlewares: MiddlewareHandler[] = [];
  private logger = new Logger();

  /**
   * Create a new HTTPS server
   * @param options HTTPS server options
   */
  constructor(options: HttpsServerOptions, router: Router) {
    this.router = router;

    // Load SSL certificate and key
    const cert = readFileSync(options.cert);
    const key = readFileSync(options.key);

    // Load CA certificate if provided
    const ca = options.ca ? readFileSync(options.ca) : undefined;

    // Create HTTPS server
    this.server = createServer(
      {
        cert,
        key,
        ca,
        requestCert: options.requestCert,
        rejectUnauthorized: options.rejectUnauthorized !== false,
        minVersion: options.minVersion || ('TLSv1.2' as SecureVersion),
        maxVersion: options.maxVersion,
        ciphers: options.ciphers
      },
      this.handleRequest.bind(this)
    );

    this.server.on('error', this.handleError.bind(this));
  }

  /**
   * Add a middleware to the middleware pipeline
   * @param middleware The middleware to add
   */
  use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Start the server
   * @param port The port to listen on
   * @param callback Callback function to execute when the server starts
   */
  listen(port: number, callback?: () => void): Server {
    this.server.listen(port, () => {
      this.logger.info(`HTTPS server running at https://localhost:${port}/`);
      if (callback) callback();
    });

    return this.server;
  }

  /**
   * Handle incoming HTTP requests
   * @param req The incoming request
   * @param res The server response
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = process.hrtime();

    try {
      // Set default headers. Content-Type is chosen by the route responder
      // from the handler's return value, so it is not forced here.
      res.setHeader('X-Powered-By', 'NexureJS');

      // Run middleware pipeline
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
      this.handleError(error, req, res);
    } finally {
      // Log request completion
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const duration = seconds * 1000 + nanoseconds / 1000000;
      this.logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Handle server errors
   * @param error The error that occurred
   * @param req The incoming request
   * @param res The server response
   */
  private handleError(error: any, req?: IncomingMessage, res?: ServerResponse): void {
    this.logger.error(`HTTPS server error: ${error.message}`);

    if (req && res) {
      // If the response has already started, the error body cannot be written.
      if (res.headersSent || res.writableEnded) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      const statusCode = error.statusCode || 500;
      const message = error.message || 'Internal Server Error';

      res.statusCode = statusCode;
      if (!res.hasHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(
        JSON.stringify({
          statusCode,
          message,
          timestamp: new Date().toISOString(),
          path: req.url
        })
      );
    }
  }

  /**
   * Close the server
   */
  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.close(err => {
        if (err) {
          this.logger.error(`Error closing HTTPS server: ${err.message}`);
          reject(err);
        } else {
          this.logger.info('HTTPS server closed');
          resolve();
        }
      });
    });
  }
}
