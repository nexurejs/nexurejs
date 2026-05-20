/**
 * HTTP response caching middleware
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { CacheOptions, CacheManager, MiddlewareHandler } from '../types/index.js';
import { crypto } from '../utils/crypto-service.js';

/**
 * HTTP cache options
 */
export interface HttpCacheOptions extends CacheOptions {
  /**
   * Cache key generator function
   */
  keyGenerator?: (req: IncomingMessage) => string;

  /**
   * Cache condition function
   */
  condition?: (req: IncomingMessage) => boolean;

  /**
   * HTTP cache control header value
   */
  cacheControl?: string;

  /**
   * Whether to add cache control headers
   */
  addHeaders?: boolean;

  /**
   * Crypto algorithm to use for cache key hashing
   */
  algorithm?: string;
}

/**
 * Default cache key generator
 * @param req The incoming request
 */
function defaultKeyGenerator(req: IncomingMessage): string {
  return `${req.method}:${req.url}`;
}

/**
 * Default cache condition
 * @param req The incoming request
 */
function defaultCondition(req: IncomingMessage): boolean {
  return req.method === 'GET' || req.method === 'HEAD';
}

/**
 * Create a HTTP response caching middleware
 * @param cacheManager The cache manager to use
 * @param options Cache options
 */
export function createCacheMiddleware(
  cacheManager: CacheManager,
  options: HttpCacheOptions = {}
): MiddlewareHandler {
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;
  const condition = options.condition || defaultCondition;
  const ttl = options.ttl || 60000; // Default to 1 minute
  const namespace = options.namespace || 'http';
  const _cacheControl = options.cacheControl || `max-age=${Math.floor(ttl / 1000)}`;
  const _addHeaders = options.addHeaders !== false;

  return async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    // Skip caching if condition is not met
    if (!condition(req)) {
      return next();
    }

    // Generate cache key
    const key = keyGenerator(req);
    const cacheKey = cacheManager.createKey(key, namespace);

    // Try to get from cache
    const cachedResponse = await cacheManager.get<{
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    }>(cacheKey);

    if (cachedResponse) {
      // Serve from cache
      res.statusCode = cachedResponse.statusCode;

      // Set headers
      for (const [name, value] of Object.entries(cachedResponse.headers)) {
        res.setHeader(name, value);
      }

      // Add cache hit header
      res.setHeader('X-Cache', 'HIT');

      // Send cached body
      res.end(cachedResponse.body);
      return;
    }

    // Add cache miss header
    res.setHeader('X-Cache', 'MISS');

    // Store the original end method
    const originalEnd = res.end;
    const body: Buffer[] = [];

    // Override the end method to capture the response
    res.end = function (
      chunk?: any,
      encoding?: BufferEncoding | (() => void),
      _callback?: () => void
    ): ServerResponse {
      // Handle overloaded method signature
      if (typeof encoding === 'function') {
        _callback = encoding;
        encoding = undefined;
      }

      if (chunk) {
        body.push(Buffer.from(chunk));
      }

      // Store the response in cache — only successful (2xx) responses, so a
      // transient error is not replayed to every client for the whole TTL.
      const statusCode = res.statusCode;
      if (cacheKey && body.length > 0 && statusCode >= 200 && statusCode < 300) {
        const responseBody = Buffer.concat(body).toString();
        const headers = res.getHeaders();

        cacheManager.set(
          cacheKey,
          {
            body: responseBody,
            headers,
            statusCode
          },
          { ttl }
        );
      }

      // Apply the original end method
      return originalEnd.apply(this, [chunk, encoding, _callback]);
    };

    // Continue with the request
    await next();
  };
}

/**
 * Create HTTP cache control middleware
 * @param options Cache control options
 */
export function createCacheControlMiddleware(
  options: {
    cacheControl?: string;
    etag?: boolean;
    lastModified?: boolean;
  } = {}
): MiddlewareHandler {
  const cacheControl = options.cacheControl || 'no-cache';
  const etag = options.etag !== false;
  const lastModified = options.lastModified !== false;

  return async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    // Set cache control header
    res.setHeader('Cache-Control', cacheControl);

    // Add ETag support
    if (etag) {
      // This is a simplified implementation
      // In a real-world scenario, you would generate a proper ETag
      // based on the response content
      const originalEnd = res.end;
      const body: Buffer[] = [];

      res.end = function (
        chunk?: any,
        encoding?: BufferEncoding | (() => void),
        _callback?: () => void
      ): ServerResponse {
        // Handle overloaded method signature
        if (typeof encoding === 'function') {
          _callback = encoding;
          encoding = undefined;
        }

        if (chunk) {
          body.push(Buffer.from(chunk));
        }

        const responseBody = Buffer.concat(body);

        // Derive the ETag from the response CONTENT. Using Date.now() (as the
        // previous implementation did) makes every ETag unique, so a client's
        // If-None-Match never matches and 304 Not Modified is never returned.
        const etag = `W/"${responseBody.length}-${crypto.hash(responseBody).slice(0, 27)}"`;
        res.setHeader('ETag', etag);

        // Check if the client sent an If-None-Match header
        const ifNoneMatch = req.headers['if-none-match'];

        if (ifNoneMatch === etag) {
          // Return 304 Not Modified
          res.statusCode = 304;

          // Apply the original end method with no content
          return originalEnd.apply(this, []);
        }

        // Apply the original end method
        return originalEnd.apply(this, [chunk, encoding, _callback]);
      };
    }

    // Add Last-Modified support
    if (lastModified) {
      // Set Last-Modified header to current time
      const lastModified = new Date().toUTCString();
      res.setHeader('Last-Modified', lastModified);

      // Check if the client sent an If-Modified-Since header
      const ifModifiedSince = req.headers['if-modified-since'];

      if (ifModifiedSince && new Date(ifModifiedSince) >= new Date(lastModified)) {
        // Return 304 Not Modified
        res.statusCode = 304;
        res.end();
        return;
      }
    }

    await next();
  };
}
