/**
 * Enhanced request and response object pool to reduce garbage collection overhead
 * with V8 engine optimizations
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { ObjectPool } from '../native/index.js';
import { v8Optimizer } from '../utils/v8-optimizer.js';
import { logger } from '../utils/logger.js';

/**
 * Request pool options
 */
export interface RequestPoolOptions {
  /**
   * Maximum size of the pool
   * @default 1000
   */
  maxSize?: number;

  /**
   * Whether to enable the pool
   * @default true
   */
  enabled?: boolean;

  /**
   * Whether to use native object pooling if available
   * @default true
   */
  useNative?: boolean;

  /**
   * Whether to automatically preallocate objects at initialization
   * @default false
   */
  preallocate?: boolean;

  /**
   * Number of objects to preallocate if preallocate is true
   * @default 100
   */
  preallocateCount?: number;

  /**
   * Whether to warmup the pool by initializing objects
   * @default true
   */
  warmup?: boolean;
}

/**
 * Base class for object pools
 */
abstract class BaseObjectPool<T> {
  // Use a standard array but with consistent access patterns for V8 optimization
  protected pool: T[] = [];
  protected maxSize: number;
  protected enabled: boolean;
  protected objectPool: ObjectPool | null = null;
  protected preallocated: boolean = false;
  // Cache frequently used functions to create monomorphic call sites
  protected readonly push = v8Optimizer.createMonomorphicCallSite(
    (array: any[], item: any) => array.push(item),
    ['object', 'object']
  );
  protected readonly pop = v8Optimizer.createMonomorphicCallSite(
    (array: any[]) => array.pop(),
    ['object']
  );

  constructor(options: RequestPoolOptions = {}) {
    // Create stable object shape by initializing properties in a consistent order
    this.maxSize = options.maxSize || 1000;
    this.enabled = options.enabled !== false;

    // Initialize native object pool if enabled
    if (options.useNative !== false) {
      try {
        // Create consistent initialization pattern for better hidden class optimization
        const poolOptions = v8Optimizer.createInlinePropertiesObject({
          maxObjectPoolSize: this.maxSize,
          enabled: this.enabled
        });
        this.objectPool = new ObjectPool(poolOptions);
      } catch (error) {
        logger.warn('Failed to initialize native object pool:', error);
        this.objectPool = null;
      }
    }

    // Preallocate objects if requested - use V8 optimizer to ensure type consistency
    if (options.preallocate && !this.preallocated) {
      const count = options.preallocateCount || 100;
      this.preallocate(count);
      this.preallocated = true;
    }

    // Warmup the pool by acquiring and releasing objects
    if (options.warmup !== false) {
      this.warmup();
    }
    
    // We'll track optimization statistics when objects are used
  }

  /**
   * Preallocate objects in the pool
   * @param count Number of objects to preallocate
   */
  protected abstract preallocate(count: number): void;

  /**
   * Warmup the pool by acquiring and releasing objects
   */
  protected warmup(): void {
    // Subclasses can implement this for specific warmup procedures
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];

    // Reset native object pool if available
    if (this.objectPool) {
      this.objectPool.reset();
    }
  }

  /**
   * Get the current size of the pool
   */
  size(): number {
    return this.pool.length;
  }

  /**
   * Get a buffer from the native pool if available
   * @param size Buffer size
   */
  getBuffer(size: number): Buffer {
    if (this.objectPool) {
      return this.objectPool.getBuffer(size);
    }
    return Buffer.alloc(size);
  }

  /**
   * Release a buffer back to the native pool
   * @param buffer Buffer to release
   */
  releaseBuffer(buffer: Buffer): void {
    if (this.objectPool) {
      this.objectPool.releaseBuffer(buffer);
    }
  }

  /**
   * Get the native object pool instance
   */
  getNativeObjectPool(): ObjectPool | null {
    return this.objectPool;
  }

  /**
   * Share the object pool with another pool
   * @param pool Another pool to share with
   */
  shareObjectPoolWith(pool: BaseObjectPool<any>): void {
    const otherNativePool = pool.getNativeObjectPool();
    if (otherNativePool && !this.objectPool) {
      this.objectPool = otherNativePool;
    }
  }
}

/**
 * Enhanced Request object pool
 */
export class RequestPool extends BaseObjectPool<IncomingMessage> {
  private socket: Socket;

  /**
   * Create a new request pool
   * @param options Request pool options
   */
  constructor(options: RequestPoolOptions = {}) {
    super(options);
    this.socket = new Socket();
  }

  /**
   * Preallocate IncomingMessage objects
   * @param count Number of objects to preallocate
   */
  protected override preallocate(count: number): void {
    if (!this.enabled) return;

    // Create objects up to the count and add them to the pool
    const currentCount = this.pool.length;
    const neededCount = Math.min(count, this.maxSize) - currentCount;

    if (neededCount <= 0) return;

    for (let i = 0; i < neededCount; i++) {
      const req = new IncomingMessage(this.socket);
      this.pool.push(req);
    }
  }

  /**
   * Warmup the pool by acquiring and releasing objects
   */
  protected override warmup(): void {
    if (!this.enabled) return;

    // Acquire and release a few objects to warmup the pool
    const warmupCount = Math.min(5, this.pool.length);
    const acquiredObjects: IncomingMessage[] = [];

    for (let i = 0; i < warmupCount; i++) {
      acquiredObjects.push(this.acquire());
    }

    // Release them back to the pool
    for (const obj of acquiredObjects) {
      this.release(obj);
    }
  }

  /**
   * Acquire a request object from the pool
   */
  acquire(): IncomingMessage {
    if (!this.enabled || this.pool.length === 0) {
      return new IncomingMessage(this.socket);
    }

    return this.pool.pop()!;
  }

  /**
   * Release a request object back to the pool
   * @param req The request object to release
   */
  release(req: IncomingMessage): void {
    if (!this.enabled || this.pool.length >= this.maxSize) {
      return;
    }

    // Clean up request object
    req.headers = {};
    req.url = '';
    req.method = '';
    req.httpVersion = '1.1';
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.trailers = {};
    req.complete = false;

    // Reset internal stream state, guarding against Node-version differences
    // in the shape of _readableState (ResponsePool.release does the same).
    const readableState = (req as any)._readableState;
    if (readableState) {
      if (readableState.buffer && typeof readableState.buffer.clear === 'function') {
        readableState.buffer.clear();
      }
      readableState.length = 0;
      readableState.ended = false;
      readableState.endEmitted = false;
    }

    // Add back to pool
    this.pool.push(req);
  }
}

/**
 * Enhanced Response object pool
 */
export class ResponsePool extends BaseObjectPool<ServerResponse> {
  /**
   * Create a new response pool
   * @param options Response pool options
   */
  constructor(options: RequestPoolOptions = {}) {
    super(options);
  }

  /**
   * Preallocate ServerResponse objects
   * @param count Number of objects to preallocate
   */
  protected override preallocate(_count: number): void {
    // We can't preallocate ServerResponse objects directly
    // since they require an IncomingMessage for construction
    // This is handled dynamically in acquire()
  }

  /**
   * Warmup the pool by acquiring and releasing objects
   */
  protected override warmup(): void {
    // ServerResponse objects require an IncomingMessage
    // so we can't easily warmup this pool
  }

  /**
   * Acquire a response object from the pool
   * @param req The request object to associate with the response
   */
  acquire(req: IncomingMessage): ServerResponse {
    if (!this.enabled || this.pool.length === 0) {
      return new ServerResponse(req);
    }

    const res = this.pool.pop()!;
    // Update the response with the new request reference
    Object.defineProperty(res, 'req', {
      value: req,
      writable: true,
      enumerable: true,
      configurable: true
    });

    return res;
  }

  /**
   * Release a response object back to the pool
   * @param res The response object to release
   */
  release(res: ServerResponse): void {
    if (!this.enabled || this.pool.length >= this.maxSize) {
      return;
    }

    // Clean up response object
    res.statusCode = 200;
    res.statusMessage = '';

    // Reset headers using a more efficient approach
    if (typeof (res as any)._headers === 'object') {
      (res as any)._headers = {};
      (res as any)._headerNames = {};
    }

    // Reset other properties
    (res as any).finished = false;
    (res as any).writableEnded = false;
    (res as any).writableFinished = false;

    // Clear write buffers if possible
    if ((res as any)._writableState) {
      (res as any)._writableState.ended = false;
      if (
        (res as any)._writableState.buffer &&
        typeof (res as any)._writableState.buffer.clear === 'function'
      ) {
        (res as any)._writableState.buffer.clear();
      }
      (res as any)._writableState.length = 0;
    }

    // Add back to pool
    this.pool.push(res);
  }

  /**
   * Get a headers object from the native pool
   */
  getHeadersObject(): Record<string, string> {
    if (this.objectPool) {
      return this.objectPool.getHeadersObject() as Record<string, string>;
    }
    // Use a regular object with explicit type annotation
    return {} as Record<string, string>;
  }

  /**
   * Release a headers object to the native pool
   * @param headers Headers object to release
   */
  releaseHeadersObject(headers: Record<string, string>): void {
    if (this.objectPool) {
      this.objectPool.releaseHeadersObject(headers);
    }
  }
}

/**
 * Create a paired request and response pool with shared native resources
 */
export function createPoolPair(options: RequestPoolOptions = {}): {
  requestPool: RequestPool;
  responsePool: ResponsePool;
} {
  const requestPool = new RequestPool(options);
  const responsePool = new ResponsePool(options);

  // Share the native object pool between the two pools
  responsePool.shareObjectPoolWith(requestPool);

  return { requestPool, responsePool };
}
