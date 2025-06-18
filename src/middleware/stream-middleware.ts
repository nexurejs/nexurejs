/**
 * Stream Middleware
 *
 * Combines content type detection and stream transformation functionality
 * for efficient HTTP request and response processing.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Writable, PassThrough, Transform, Readable, TransformCallback } from 'node:stream';

// Simple logging helper instead of using Logger to avoid circular dependencies
const logger = {
  warn: (message: string, ...args: any[]): void => {
    console.warn(`[StreamMiddleware] ${message}`, ...args);
  }
};

/**
 * Check if request has a body
 * @param req The request object
 * @returns True if the request has a body
 */
function hasBody(req: IncomingMessage): boolean {
  return (
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    req.method !== 'DELETE' &&
    (req.headers['content-length'] !== undefined || req.headers['transfer-encoding'] !== undefined)
  );
}

/**
 * Get content type from request
 * @param req The request object
 * @returns Content type string or undefined
 */
function getContentType(req: IncomingMessage): string | undefined {
  const contentType = req.headers['content-type'];
  if (!contentType) return undefined;

  // Return only the MIME type portion (before ';')
  const semicolonIndex = contentType.indexOf(';');
  return semicolonIndex !== -1
    ? contentType.substring(0, semicolonIndex).trim()
    : contentType.trim();
}

/**
 * Stream processing options
 */
export interface StreamOptions {
  /**
   * Maximum size in bytes to buffer in memory
   * @default 1048576 (1MB)
   */
  maxBufferSize?: number;

  /**
   * Size of chunks to process at a time
   * @default 16384 (16KB)
   */
  chunkSize?: number;

  /**
   * Minimum size in bytes required to enable streaming
   * @default 4096 (4KB)
   */
  streamThreshold?: number;

  /**
   * Whether to expose the raw stream on the request object
   * @default true
   */
  exposeStreams?: boolean;

  /**
   * Content types to transform
   * @default ['application/json', 'text/*', 'application/x-www-form-urlencoded']
   */
  contentTypes?: string[];

  /**
   * Whether to flush output at each chunk
   * @default false
   */
  flushPerChunk?: boolean;

  /**
   * Whether to automatically transform content based on type
   * @default true
   */
  autoTransform?: boolean;
}

/**
 * Default stream options
 */
const DEFAULT_OPTIONS: Required<StreamOptions> = {
  maxBufferSize: 1048576, // 1MB
  chunkSize: 16384, // 16KB
  streamThreshold: 4096, // 4KB
  exposeStreams: true,
  contentTypes: ['application/json', 'text/*', 'application/x-www-form-urlencoded'],
  flushPerChunk: false,
  autoTransform: true
};

/**
 * Stream processing result interface
 */
export interface StreamResult<T = any> {
  data: T;
  raw: Buffer;
}

// Type extensions for IncomingMessage
declare module 'node:http' {
  interface IncomingMessage {
    contentType?: string;
    rawBodyStream?: PassThrough;
    jsonBodyStream?: Transform;
    textBodyStream?: Transform;
    formBodyStream?: Transform;
    multipartBodyStream?: PassThrough;
    bodyStream?: PassThrough;
    jsonBody?: any;
    textBody?: string;
    formBody?: Record<string, string>;
    bufferBody?: Buffer;
    processedBody?: any;
    originalPipe?: typeof IncomingMessage.prototype.pipe;
  }
}

/**
 * Creates stream middleware that combines content type detection
 * and appropriate stream processing
 *
 * @param options Stream processing options
 * @returns Middleware function
 */
export function createStreamMiddleware(options: Partial<StreamOptions> = {}) {
  const opts: Required<StreamOptions> = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  return async function streamMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: Error) => void
  ): Promise<void> {
    try {
      // Skip processing if no body expected
      if (!hasBody(req)) {
        return next();
      }

      // Get content type
      const contentType = getContentType(req);
      req.contentType = contentType;

      // Set up streams based on content type
      if (opts.exposeStreams) {
        const rawStream = new PassThrough();
        req.rawBodyStream = rawStream;

        if (shouldProcessContentType(contentType, opts.contentTypes)) {
          if (contentType && /application\/json/.test(contentType)) {
            setupJsonProcessing(req, rawStream, opts);
          } else if (contentType && /text\/plain/.test(contentType)) {
            setupTextProcessing(req, rawStream, opts);
          } else if (contentType && /application\/x-www-form-urlencoded/.test(contentType)) {
            setupFormProcessing(req, rawStream, opts);
          } else if (contentType && /multipart\/form-data/.test(contentType)) {
            setupMultipartProcessing(req, rawStream, opts);
          } else {
            // Generic stream
            setupGenericProcessing(req, rawStream, opts);
          }
        } else {
          // Just pass through for unprocessed content types
          setupPassthroughProcessing(req, rawStream);
        }
      }

      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

/**
 * Determine if a content type should be processed
 */
function shouldProcessContentType(
  contentType: string | undefined,
  allowedTypes: string[]
): boolean {
  if (!contentType || !allowedTypes.length) {
    return false;
  }

  return allowedTypes.some(allowed => {
    if (allowed === '*') {
      return true;
    }

    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, -2);
      return contentType.startsWith(prefix);
    }

    return contentType === allowed;
  });
}

/**
 * Set up JSON processing
 */
function setupJsonProcessing(
  req: IncomingMessage,
  rawStream: PassThrough,
  options: Required<StreamOptions>
): void {
  const originalPipe = req.pipe;
  req.originalPipe = originalPipe;

  const jsonTransformer = createJsonTransformer(data => {
    req.jsonBody = data;
    req.processedBody = data;
    return data;
  }, options);

  req.jsonBodyStream = jsonTransformer;

  if (options.autoTransform) {
    setupAutoPipe(req, rawStream, jsonTransformer);
  }
}

/**
 * Set up text processing
 */
function setupTextProcessing(
  req: IncomingMessage,
  rawStream: PassThrough,
  options: Required<StreamOptions>
): void {
  const originalPipe = req.pipe;
  req.originalPipe = originalPipe;

  const textTransformer = createTextTransformer(text => {
    req.textBody = text;
    req.processedBody = text;
    return text;
  }, options);

  req.textBodyStream = textTransformer;

  if (options.autoTransform) {
    setupAutoPipe(req, rawStream, textTransformer);
  }
}

/**
 * Set up form processing
 */
function setupFormProcessing(
  req: IncomingMessage,
  rawStream: PassThrough,
  options: Required<StreamOptions>
): void {
  const originalPipe = req.pipe;
  req.originalPipe = originalPipe;

  const formTransformer = createFormTransformer(formData => {
    req.formBody = formData;
    req.processedBody = formData;
    return formData;
  }, options);

  req.formBodyStream = formTransformer;

  if (options.autoTransform) {
    setupAutoPipe(req, rawStream, formTransformer);
  }
}

/**
 * Set up multipart processing
 */
function setupMultipartProcessing(
  req: IncomingMessage,
  rawStream: PassThrough,
  options: Required<StreamOptions>
): void {
  const originalPipe = req.pipe;
  req.originalPipe = originalPipe;

  // For multipart, we just expose the raw stream
  // specialized handling is usually done through the body parser
  req.multipartBodyStream = rawStream;

  if (options.autoTransform) {
    setupAutoPipe(req, rawStream);
  }
}

/**
 * Set up generic processing
 */
function setupGenericProcessing(
  req: IncomingMessage,
  rawStream: PassThrough,
  options: Required<StreamOptions>
): void {
  const originalPipe = req.pipe;
  req.originalPipe = originalPipe;

  // Create buffer collector
  const bufferTransformer = createBufferTransformer(buffer => {
    req.bufferBody = buffer;
    req.processedBody = buffer;
    return buffer;
  }, options);

  req.bodyStream = rawStream;

  if (options.autoTransform) {
    setupAutoPipe(req, rawStream, bufferTransformer);
  }
}

/**
 * Set up passthrough (no processing)
 */
function setupPassthroughProcessing(req: IncomingMessage, rawStream: PassThrough): void {
  const originalPipe = req.pipe;
  req.originalPipe = originalPipe;
  req.bodyStream = rawStream;

  setupAutoPipe(req, rawStream);
}

/**
 * Set up automatic pipe override
 */
function setupAutoPipe(
  req: IncomingMessage,
  rawStream: PassThrough,
  transformer?: Transform
): void {
  // Override pipe to insert our transformers
  req.pipe = function <T extends NodeJS.WritableStream>(
    destination: T,
    options?: { end?: boolean }
  ): T {
    // Restore original pipe
    req.pipe = req.originalPipe!;

    // Set up pipeline with transformers
    if (transformer) {
      req.originalPipe!.call(req, rawStream, options);
      rawStream.pipe(transformer, options);
      transformer.pipe(destination, options);
    } else {
      req.originalPipe!.call(req, rawStream, options);
      rawStream.pipe(destination, options);
    }

    return destination;
  };
}

/**
 * Create a JSON transformer
 */
function createJsonTransformer(
  processFunction: (data: any) => any,
  options: Required<StreamOptions>
): Transform {
  let buffer = Buffer.alloc(0);

  return new Transform({
    objectMode: true,

    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
      try {
        // Append chunk to buffer
        const newBuffer = Buffer.alloc(buffer.length + chunk.length);
        buffer.copy(newBuffer);
        chunk.copy(newBuffer, buffer.length);
        buffer = newBuffer;

        // Check if we should flush now
        if (options.flushPerChunk) {
          this.push(chunk);
        }

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },

    flush(callback: TransformCallback): void {
      try {
        // Try to parse JSON
        if (buffer.length > 0) {
          try {
            const jsonData = JSON.parse(buffer.toString('utf8'));
            const processed = processFunction(jsonData);
            this.push(processed !== undefined ? processed : null);
          } catch (err) {
            logger.warn('Error parsing JSON:', err instanceof Error ? err.message : String(err));
            this.push(buffer); // Push original on error
          }
        }

        // Release buffer
        buffer = Buffer.alloc(0);
        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * Create a text transformer
 */
function createTextTransformer(
  processFunction: (text: string) => string,
  options: Required<StreamOptions>
): Transform {
  let buffer = Buffer.alloc(0);

  return new Transform({
    objectMode: true,

    transform(chunk: Buffer, _encoding, callback): void {
      try {
        // Append chunk to buffer
        const newBuffer = Buffer.alloc(buffer.length + chunk.length);
        buffer.copy(newBuffer);
        chunk.copy(newBuffer, buffer.length);
        buffer = newBuffer;

        // Check if we should flush now
        if (options.flushPerChunk) {
          this.push(chunk);
        }

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },

    flush(callback: TransformCallback): void {
      try {
        // Process text
        if (buffer.length > 0) {
          const text = buffer.toString('utf8');
          const processed = processFunction(text);
          this.push(processed);
        }

        // Release buffer
        buffer = Buffer.alloc(0);
        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * Create a form data transformer
 */
function createFormTransformer(
  processFunction: (data: Record<string, string>) => Record<string, string>,
  options: Required<StreamOptions>
): Transform {
  let buffer = Buffer.alloc(0);

  return new Transform({
    objectMode: true,

    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
      try {
        // Append chunk to buffer
        const newBuffer = Buffer.alloc(buffer.length + chunk.length);
        buffer.copy(newBuffer);
        chunk.copy(newBuffer, buffer.length);
        buffer = newBuffer;

        // Check if we should flush now
        if (options.flushPerChunk) {
          this.push(chunk);
        }

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },

    flush(callback: TransformCallback): void {
      try {
        // Parse form data
        if (buffer.length > 0) {
          const text = buffer.toString('utf8');
          const formData: Record<string, string> = {};

          // Parse URL encoded form data
          text.split('&').forEach(pair => {
            if (!pair) return;

            try {
              const [key, value] = pair.split('=').map(decodeURIComponent);
              if (key) {
                formData[key] = value || '';
              }
            } catch (err) {
              logger.warn(
                'Error parsing form data:',
                err instanceof Error ? err.message : String(err)
              );
            }
          });

          const processed = processFunction(formData);
          this.push(processed);
        }

        // Release buffer
        buffer = Buffer.alloc(0);
        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * Create a buffer transformer
 */
function createBufferTransformer(
  processFunction: (buffer: Buffer) => Buffer | any,
  options: Required<StreamOptions>
): Transform {
  let buffer = Buffer.alloc(0);

  return new Transform({
    objectMode: true,

    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
      try {
        // Append chunk to buffer
        const newBuffer = Buffer.alloc(buffer.length + chunk.length);
        buffer.copy(newBuffer);
        chunk.copy(newBuffer, buffer.length);
        buffer = newBuffer;

        // Check if we should flush now
        if (options.flushPerChunk) {
          this.push(chunk);
        }

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },

    flush(callback: TransformCallback): void {
      try {
        // Process buffer
        if (buffer.length > 0) {
          const processed = processFunction(buffer);
          this.push(processed !== undefined ? processed : null);
        }

        // Release buffer
        buffer = Buffer.alloc(0);
        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * Helper function to read a stream into a buffer
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Helper class to collect stream data into a buffer
 */
export class BufferCollector extends Writable {
  private chunks: Buffer[] = [];
  private _buffer: Buffer | null = null;

  constructor() {
    super();
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.chunks.push(chunk);
    callback();
  }

  getBuffer(): Buffer {
    if (!this._buffer) {
      this._buffer = Buffer.concat(this.chunks);
    }
    return this._buffer;
  }

  getSize(): number {
    return this.chunks.reduce((total, chunk) => total + chunk.length, 0);
  }

  reset(): void {
    this.chunks = [];
    this._buffer = null;
  }
}

/**
 * Shorthand middleware that provides stream processing
 */
export const stream = createStreamMiddleware();

export default stream;
