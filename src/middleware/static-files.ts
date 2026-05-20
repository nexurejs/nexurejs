/**
 * Static file serving middleware with optimized buffer pool
 *
 * Features:
 * - Buffer pool for efficient memory usage
 * - LRU cache for frequently accessed files
 * - Streaming for large files with buffer recycling
 * - Content-Type detection
 * - ETag and conditional requests support
 * - Range requests support
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, Stats, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve, isAbsolute, sep } from 'node:path';
import { Readable } from 'node:stream';
import { parse as _parseUrl } from 'node:url';
import { MiddlewareHandler } from './middleware.js';
import { Logger } from '../utils/logger.js';

// Default MIME types for common file extensions
const DEFAULT_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip'
};

/**
 * Static file serving options
 */
export interface StaticFileOptions {
  /**
   * Root directory to serve files from
   */
  root: string;

  /**
   * URL path prefix to match
   * @default '/'
   */
  prefix?: string;

  /**
   * Whether to fallthrough to the next middleware
   * @default true
   */
  fallthrough?: boolean;

  /**
   * Index file to serve for directories
   * @default 'index.html'
   */
  index?: string | false;

  /**
   * Cache control header value
   * @default 'public, max-age=86400'
   */
  cacheControl?: string;

  /**
   * Whether to add ETag headers
   * @default true
   */
  etag?: boolean;

  /**
   * Whether to add Last-Modified headers
   * @default true
   */
  lastModified?: boolean;

  /**
   * Custom MIME types mapping
   */
  mimeTypes?: Record<string, string>;

  /**
   * Default MIME type for unknown extensions
   * @default 'application/octet-stream'
   */
  defaultMimeType?: string;

  /**
   * Max age in milliseconds for cached files
   * @default 86400000 (1 day)
   */
  maxAge?: number;

  /**
   * Max size in bytes for the LRU cache
   * @default 50 * 1024 * 1024 (50MB)
   */
  maxCacheSize?: number;

  /**
   * Max file size in bytes to cache
   * @default 2 * 1024 * 1024 (2MB)
   */
  maxFileSizeToCache?: number;

  /**
   * Buffer size in bytes for streaming
   * @default 64 * 1024 (64KB)
   */
  bufferSize?: number;

  /**
   * Whether to support range requests
   * @default true
   */
  ranges?: boolean;

  /**
   * Maximum buffer pool size in bytes
   * @default 100 * 1024 * 1024 (100MB)
   */
  maxBufferPoolSize?: number;

  /**
   * Whether to allow directory listing
   * @default false
   */
  directoryListing?: boolean;

  /**
   * Pre-compress files with gzip and brotli
   * @default false
   */
  compress?: boolean;
}

/**
 * File cache entry
 */
interface FileCacheEntry {
  buffer: Buffer;
  stats: Stats;
  etag: string;
  contentType: string;
  lastAccessed: number;
  size: number;
}

/**
 * Buffer pool entry
 */
interface BufferPoolEntry {
  buffer: Buffer;
  size: number;
  inUse: boolean;
}

/**
 * Static file server middleware
 */
export class StaticFileMiddleware {
  private readonly options: Required<StaticFileOptions>;
  private readonly logger: Logger;
  private readonly fileCache: Map<string, FileCacheEntry>;
  private readonly bufferPool: BufferPoolEntry[];
  private totalCacheSize: number = 0;
  private totalBufferPoolSize: number = 0;

  /**
   * Create a new static file middleware
   * @param options Static file options
   */
  constructor(options: StaticFileOptions) {
    // Set default options
    this.options = {
      root: resolve(options.root),
      prefix: options.prefix || '/',
      fallthrough: options.fallthrough !== false,
      index: options.index !== false ? options.index || 'index.html' : false,
      cacheControl: options.cacheControl || 'public, max-age=86400',
      etag: options.etag !== false,
      lastModified: options.lastModified !== false,
      mimeTypes: { ...DEFAULT_MIME_TYPES, ...options.mimeTypes },
      defaultMimeType: options.defaultMimeType || 'application/octet-stream',
      maxAge: options.maxAge || 86400000, // 1 day
      maxCacheSize: options.maxCacheSize || 50 * 1024 * 1024, // 50MB
      maxFileSizeToCache: options.maxFileSizeToCache || 2 * 1024 * 1024, // 2MB
      bufferSize: options.bufferSize || 64 * 1024, // 64KB
      ranges: options.ranges !== false,
      maxBufferPoolSize: options.maxBufferPoolSize || 100 * 1024 * 1024, // 100MB
      directoryListing: options.directoryListing || false,
      compress: options.compress || false
    };

    this.logger = new Logger();
    this.fileCache = new Map();
    this.bufferPool = [];

    // Initialize buffer pool with a few buffers of different sizes
    this.addBufferToPool(4 * 1024); // 4KB
    this.addBufferToPool(16 * 1024); // 16KB
    this.addBufferToPool(64 * 1024); // 64KB
    this.addBufferToPool(256 * 1024); // 256KB
    this.addBufferToPool(1024 * 1024); // 1MB
  }

  /**
   * Get middleware handler
   */
  public getHandler(): MiddlewareHandler {
    return this.serveStatic.bind(this);
  }

  /**
   * Try to serve an index file from the directory
   */
  private async tryServeIndexFile(
    req: IncomingMessage,
    res: ServerResponse,
    fullPath: string,
    _next: () => Promise<void>
  ): Promise<void | undefined> {
    if (!this.options.index) return undefined;

    // Try to serve the index file
    const indexPath = join(fullPath, this.options.index);
    try {
      const indexStats = await fs.stat(indexPath);
      if (indexStats.isFile()) {
        return this.serveFile(req, res, indexPath, indexStats);
      }
    } catch (_err) {
      // No index file
    }

    return undefined;
  }

  /**
   * Handle directory request
   */
  private async handleDirectory(
    req: IncomingMessage,
    res: ServerResponse,
    fullPath: string,
    path: string,
    next: () => Promise<void>
  ): Promise<void> {
    // Try to serve an index file
    const indexResult = await this.tryServeIndexFile(req, res, fullPath, next);
    if (indexResult !== undefined) {
      return indexResult;
    }

    if (this.options.directoryListing) {
      // Serve directory listing
      return this.serveDirectoryListing(req, res, fullPath, path);
    }

    if (this.options.fallthrough) {
      return next();
    }

    res.statusCode = 404;
    res.end('Not Found');
  }

  /**
   * Serve static content
   */
  public async serveStatic(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => Promise<void>
  ): Promise<void> {
    // Only handle GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (this.options.fallthrough) {
        return next();
      }
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }

    // Get the path from the request URL
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      // Malformed percent-encoding in the request URL.
      if (this.options.fallthrough) {
        return next();
      }
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    // Check for path traversal attempts
    if (path.includes('..') || !isAbsolute(normalize(`/${path}`))) {
      if (this.options.fallthrough) {
        return next();
      }
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      // Join with the root directory
      const fullPath = join(this.options.root, path);

      // Defense in depth: even after the '..' check, verify the resolved path
      // cannot escape the configured root before touching the filesystem.
      if (fullPath !== this.options.root && !fullPath.startsWith(this.options.root + sep)) {
        if (this.options.fallthrough) {
          return next();
        }
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        return this.handleDirectory(req, res, fullPath, path, next);
      }

      // Handle file
      if (stats.isFile()) {
        return this.serveFile(req, res, fullPath, stats);
      }

      // Fallthrough for other file types
      if (this.options.fallthrough) {
        return next();
      }

      res.statusCode = 404;
      res.end('Not Found');
    } catch (_err) {
      if (this.options.fallthrough) {
        return next();
      }

      res.statusCode = 404;
      res.end('Not Found');
    }
  }

  /**
   * Serve a file
   */
  private async serveFile(
    req: IncomingMessage,
    res: ServerResponse,
    filePath: string,
    stats: Stats
  ): Promise<void> {
    // Get file extension and content type
    const ext = extname(filePath).toLowerCase();
    const contentType = this.options.mimeTypes[ext] || this.options.defaultMimeType;

    // Set content type header
    res.setHeader('Content-Type', contentType);

    // Set cache control header
    res.setHeader('Cache-Control', this.options.cacheControl);

    // Last modified header
    if (this.options.lastModified) {
      res.setHeader('Last-Modified', stats.mtime.toUTCString());

      // Check if-modified-since
      const ifModifiedSince = req.headers['if-modified-since'];
      if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }

    // Generate ETag
    let etag: string | undefined;
    if (this.options.etag) {
      etag = `W/"${stats.size.toString(16)}-${stats.mtime.getTime().toString(16)}"`;
      res.setHeader('ETag', etag);

      // Check if-none-match
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === etag) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }

    // Handle HEAD requests
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', stats.size);
      res.end();
      return;
    }

    // Check cache for small files
    if (stats.size <= this.options.maxFileSizeToCache) {
      const cacheKey = filePath;
      const cachedFile = this.fileCache.get(cacheKey);

      if (
        cachedFile &&
        cachedFile.stats.mtime.getTime() === stats.mtime.getTime() &&
        cachedFile.stats.size === stats.size
      ) {
        // Update last accessed time
        cachedFile.lastAccessed = Date.now();

        // Send the cached file
        res.setHeader('Content-Length', cachedFile.size);
        res.setHeader('X-Cache', 'HIT');
        res.end(cachedFile.buffer);
        return;
      }

      try {
        // Read the file into memory
        const buffer = await fs.readFile(filePath);

        // Cache the file
        this.cacheFile(cacheKey, buffer, stats, etag || '', contentType);

        // Send the file
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('X-Cache', 'MISS');
        res.end(buffer);
        return;
      } catch (_err) {
        res.statusCode = 500;
        res.end('Internal Server Error');
        return;
      }
    }

    // For larger files, use streaming
    try {
      // Handle range requests
      if (this.options.ranges && req.headers.range) {
        const ranges = this.parseRangeHeader(req.headers.range, stats.size);

        if (ranges === -1) {
          // Malformed range header
          res.statusCode = 416; // Range Not Satisfiable
          res.setHeader('Content-Range', `bytes */${stats.size}`);
          res.end();
          return;
        }

        if (ranges.length === 1) {
          // Single range request
          const [start, end] = ranges[0]!;
          const length = end - start + 1;

          res.statusCode = 206; // Partial Content
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
          res.setHeader('Content-Length', length);

          // Stream the range
          const stream = createReadStream(filePath, { start, end });
          await this.streamFileWithBufferReuse(stream, res);
          return;
        }

        // Multiple ranges not supported for now, just send the entire file
      }

      // Set Content-Length header for the full file
      res.setHeader('Content-Length', stats.size);

      // Stream the file
      const stream = createReadStream(filePath);
      await this.streamFileWithBufferReuse(stream, res);
    } catch (err) {
      this.logger.error(`Error streaming file: ${filePath}`, err);
      // Only set status code if headers haven't been sent yet
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  }

  /**
   * Stream a file using buffer reuse
   */
  private streamFileWithBufferReuse(stream: Readable, res: ServerResponse): Promise<void> {
    return new Promise((resolve, reject) => {
      // Get a buffer from the pool
      let buffer = this.getBufferFromPool();
      let offset = 0;

      stream.on('data', (chunk: Buffer) => {
        // Check if the chunk fits in the current buffer
        if (offset + chunk.length > buffer.length) {
          // Send the current buffer
          res.write(buffer.subarray(0, offset));

          // Get a new buffer, preferably large enough for the current chunk
          this.releaseBufferToPool(buffer);
          buffer = this.getBufferFromPool(chunk.length);
          offset = 0;
        }

        // Copy the chunk to the buffer
        chunk.copy(buffer, offset);
        offset += chunk.length;
      });

      stream.on('end', () => {
        // Send any remaining data
        if (offset > 0) {
          res.write(buffer.subarray(0, offset));
        }

        // Release the buffer back to the pool
        this.releaseBufferToPool(buffer);

        // End the response
        res.end();
        resolve();
      });

      stream.on('error', err => {
        // Release the buffer back to the pool
        this.releaseBufferToPool(buffer);

        // Reject the promise
        reject(err);
      });

      // Handle client disconnect
      res.on('close', () => {
        stream.destroy();
        this.releaseBufferToPool(buffer);
        resolve();
      });
    });
  }

  /**
   * Parse the Range header
   * @returns Array of [start, end] ranges or -1 for invalid ranges
   */
  private parseRangeHeader(rangeHeader: string, fileSize: number): [number, number][] | -1 {
    const matches = /^bytes=(.*)$/.exec(rangeHeader);
    if (!matches) {
      return -1;
    }

    const ranges: [number, number][] = [];
    const rangeValues = matches[1]!.split(',').map(r => r.trim());

    for (const range of rangeValues) {
      const rangeParts = range.split('-');
      if (rangeParts.length !== 2) {
        return -1;
      }

      let start: number;
      let end: number;

      if (rangeParts[0] === '') {
        // suffix range: -N
        start = Math.max(0, fileSize - parseInt(rangeParts[1]!, 10));
        end = fileSize - 1;
      } else if (rangeParts[1] === '') {
        // prefix range: N-
        start = parseInt(rangeParts[0]!, 10);
        end = fileSize - 1;
      } else {
        // range: N-M
        start = parseInt(rangeParts[0]!, 10);
        end = parseInt(rangeParts[1]!, 10);
      }

      // Validate range
      if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return -1;
      }

      ranges.push([start, end]);
    }

    return ranges.length ? ranges : -1;
  }

  /**
   * Serve a directory listing
   */
  private async serveDirectoryListing(
    req: IncomingMessage,
    res: ServerResponse,
    dirPath: string,
    urlPath: string
  ): Promise<void> {
    try {
      const files = await fs.readdir(dirPath);
      const fileList = await Promise.all(
        files.map(async file => {
          const filePath = join(dirPath, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            mtime: stats.mtime
          };
        })
      );

      // Sort: directories first, then files
      fileList.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      // Generate HTML
      const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Directory listing for ${urlPath}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 1000px; margin: 0 auto; padding: 20px; color: #333; }
            h1 { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
            tr:hover { background-color: #f5f5f5; }
            .size { text-align: right; }
            .date { min-width: 200px; }
            a { color: #0366d6; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .directory { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Directory listing for ${urlPath}</h1>
          <table>
            <tr>
              <th>Name</th>
              <th class="size">Size</th>
              <th class="date">Modified</th>
            </tr>
            ${
              urlPath !== '/'
                ? `
            <tr>
              <td><a href="../">Parent Directory</a></td>
              <td class="size">-</td>
              <td class="date">-</td>
            </tr>`
                : ''
            }
            ${fileList
              .map(
                file => `
            <tr>
              <td><a href="${encodeURIComponent(file.name)}${file.isDirectory ? '/' : ''}" class="${file.isDirectory ? 'directory' : ''}">${file.name}${file.isDirectory ? '/' : ''}</a></td>
              <td class="size">${file.isDirectory ? '-' : this.formatFileSize(file.size)}</td>
              <td class="date">${file.mtime.toLocaleString()}</td>
            </tr>`
              )
              .join('')}
          </table>
        </body>
      </html>
      `;

      // Set headers
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html));

      // No caching for directory listings
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Send response
      res.end(html);
    } catch (_err) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(size: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  /**
   * Cache a file in memory
   */
  private cacheFile(
    key: string,
    buffer: Buffer,
    stats: Stats,
    etag: string,
    contentType: string
  ): void {
    // Check if we need to make room in the cache
    if (this.totalCacheSize + buffer.length > this.options.maxCacheSize) {
      this.evictLeastRecentlyUsed(buffer.length);
    }

    // Add file to cache
    this.fileCache.set(key, {
      buffer,
      stats,
      etag,
      contentType,
      lastAccessed: Date.now(),
      size: buffer.length
    });

    this.totalCacheSize += buffer.length;
  }

  /**
   * Evict least recently used files from cache to make room
   */
  private evictLeastRecentlyUsed(spaceNeeded: number): void {
    // Sort cache entries by last accessed time
    const entries = [...this.fileCache.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    let spaceFreed = 0;
    for (const [key, entry] of entries) {
      this.fileCache.delete(key);
      spaceFreed += entry.size;
      this.totalCacheSize -= entry.size;

      if (spaceFreed >= spaceNeeded) {
        break;
      }
    }
  }

  /**
   * Get a buffer from the pool
   */
  private getBufferFromPool(minSize: number = this.options.bufferSize): Buffer {
    // Find the smallest buffer that can fit the requested size
    for (let i = 0; i < this.bufferPool.length; i++) {
      const entry = this.bufferPool[i]!;
      if (!entry.inUse && entry.size >= minSize) {
        entry.inUse = true;
        return entry.buffer;
      }
    }

    // No suitable buffer found, create a new one
    // Choose a power of 2 size that fits the requested size
    let size = 4 * 1024; // Start with 4KB
    while (size < minSize) {
      size *= 2;
    }

    // Add to pool and return
    return this.addBufferToPool(size);
  }

  /**
   * Release a buffer back to the pool
   */
  private releaseBufferToPool(buffer: Buffer): void {
    for (const entry of this.bufferPool) {
      if (entry.buffer === buffer) {
        entry.inUse = false;
        return;
      }
    }
  }

  /**
   * Add a new buffer to the pool
   */
  private addBufferToPool(size: number): Buffer {
    // Check if adding this buffer would exceed the pool size limit
    if (this.totalBufferPoolSize + size > this.options.maxBufferPoolSize) {
      // Try to remove unused buffers
      this.cleanupBufferPool();

      // If still not enough space, don't add to pool but return a temporary buffer
      if (this.totalBufferPoolSize + size > this.options.maxBufferPoolSize) {
        return Buffer.allocUnsafe(size);
      }
    }

    // Create and add the buffer to the pool
    const buffer = Buffer.allocUnsafe(size);
    this.bufferPool.push({
      buffer,
      size,
      inUse: true
    });
    this.totalBufferPoolSize += size;
    return buffer;
  }

  /**
   * Clean up unused buffers from the pool
   */
  private cleanupBufferPool(): void {
    // Remove unused buffers, starting from largest to smallest
    const unusedBuffers = this.bufferPool
      .filter(entry => !entry.inUse)
      .sort((a, b) => b.size - a.size);

    // Keep track of indexes to remove
    const indexesToRemove: number[] = [];

    for (const entry of unusedBuffers) {
      const index = this.bufferPool.indexOf(entry);
      if (index !== -1) {
        indexesToRemove.push(index);
        this.totalBufferPoolSize -= entry.size;

        // Stop if we've freed enough space
        if (this.totalBufferPoolSize <= this.options.maxBufferPoolSize * 0.8) {
          break;
        }
      }
    }

    // Remove the buffers from the pool (in reverse order to maintain correct indexes)
    for (let i = indexesToRemove.length - 1; i >= 0; i--) {
      this.bufferPool.splice(indexesToRemove[i]!, 1);
    }
  }

  /**
   * Get cache stats
   */
  public getCacheStats(): {
    fileCount: number;
    totalSize: number;
    bufferPoolCount: number;
    bufferPoolSize: number;
  } {
    return {
      fileCount: this.fileCache.size,
      totalSize: this.totalCacheSize,
      bufferPoolCount: this.bufferPool.length,
      bufferPoolSize: this.totalBufferPoolSize
    };
  }

  /**
   * Clear the file cache
   */
  public clearCache(): void {
    this.fileCache.clear();
    this.totalCacheSize = 0;
  }
}

/**
 * Create a static file middleware
 * @param options Static file options
 */
export function createStaticMiddleware(options: StaticFileOptions): MiddlewareHandler {
  const middleware = new StaticFileMiddleware(options);
  return middleware.getHandler();
}
