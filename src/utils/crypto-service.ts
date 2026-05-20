/**
 * Crypto Service
 *
 * A consolidated service providing crypto utilities with efficient
 * implementations and memory management.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * Options for hash generation
 */
export interface HashOptions {
  /**
   * Algorithm to use
   * @default 'sha256'
   */
  algorithm?: string;

  /**
   * Output encoding
   * @default 'hex'
   */
  encoding?: 'hex' | 'base64' | 'base64url';

  /**
   * Whether to use buffer pool for improved performance
   * @default true
   */
  useBufferPool?: boolean;
}

/**
 * Default hash options
 */
const DEFAULT_HASH_OPTIONS: Required<HashOptions> = {
  algorithm: 'sha256',
  encoding: 'hex',
  useBufferPool: true
};

/**
 * Crypto service singleton
 */
export class CryptoService {
  /**
   * Hash cache for commonly used hashes to avoid repeated computation
   */
  private hashCache = new Map<string, string>();

  /**
   * Maximum size of hash cache
   */
  private maxCacheSize = 1000;

  /**
   * Generate a hash of a string or buffer
   * @param data - Data to hash
   * @param options - Hash options
   * @returns The computed hash
   */
  hash(data: string | Buffer, options: HashOptions = {}): string {
    const opts = { ...DEFAULT_HASH_OPTIONS, ...options };

    // Check cache for string data with default options
    if (
      typeof data === 'string' &&
      opts.algorithm === DEFAULT_HASH_OPTIONS.algorithm &&
      opts.encoding === DEFAULT_HASH_OPTIONS.encoding
    ) {
      const cacheKey = `${opts.algorithm}:${data}`;

      if (this.hashCache.has(cacheKey)) {
        return this.hashCache.get(cacheKey)!;
      }

      const result = this.computeHash(data, opts);

      // Manage cache size
      if (this.hashCache.size >= this.maxCacheSize) {
        const oldestKey = this.hashCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.hashCache.delete(oldestKey);
        }
      }

      this.hashCache.set(cacheKey, result);
      return result;
    }

    return this.computeHash(data, opts);
  }

  /**
   * Generate a random string of specified length
   * @param length - Length of random string
   * @param encoding - Output encoding
   * @returns Random string
   */
  randomString(length: number = 32, encoding: BufferEncoding = 'hex'): string {
    // Generate `length` random bytes: every supported encoding (hex, base64,
    // base64url, ...) yields at least one character per byte, so slicing to
    // `length` always produces a string of exactly the requested length.
    // The previous ceil(length / 2) only held for hex and returned short
    // strings for base64/base64url.
    return randomBytes(length).toString(encoding).slice(0, length);
  }

  /**
   * Generate a UUID v4
   * @returns UUID string
   */
  uuid(): string {
    return randomUUID();
  }

  /**
   * Generate a time-based unique ID
   * @param prefix - Optional prefix for the ID
   * @returns Unique ID
   */
  uniqueId(prefix: string = ''): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Compare two strings or buffers in constant time
   * @param a - First value
   * @param b - Second value
   * @returns True if values are equal
   */
  constantTimeCompare(a: string | Buffer, b: string | Buffer): boolean {
    // Convert strings to buffers
    const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
    const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b));

    // Different lengths means automatic fail, but continue comparison
    // to maintain constant time
    if (bufA.length !== bufB.length) {
      // Still do the comparison to make timing attacks harder
      let _result = 0;
      const len = Math.min(bufA.length, bufB.length);

      for (let i = 0; i < len; i++) {
        _result |= bufA[i]! ^ bufB[i]!;
      }

      return false;
    }

    // Compare all bytes
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i]! ^ bufB[i]!;
    }

    return result === 0;
  }

  /**
   * Internal hash computation
   * @private
   */
  private computeHash(data: string | Buffer, options: Required<HashOptions>): string {
    // Create a fresh hash instance each time
    const hash = createHash(options.algorithm);

    // For strings, use direct update
    if (typeof data === 'string') {
      hash.update(data);
      return hash.digest(options.encoding as 'hex' | 'base64' | 'base64url');
    }

    // For buffers, use optimized approach
    if (options.useBufferPool && data.length > 1024) {
      // For large buffers, process in chunks to avoid blocking
      const chunkSize = 16 * 1024; // 16KB chunks

      for (let i = 0; i < data.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, data.length);
        hash.update(data.subarray(i, end));
      }
    } else {
      hash.update(data);
    }

    return hash.digest(options.encoding as 'hex' | 'base64' | 'base64url');
  }

  /**
   * Clear hash cache
   */
  clearCache(): void {
    this.hashCache.clear();
  }

  /**
   * Set the maximum cache size
   * @param size - New maximum cache size
   */
  setMaxCacheSize(size: number): void {
    if (size < 0) {
      throw new Error('Cache size cannot be negative');
    }

    this.maxCacheSize = size;

    // Trim cache if necessary
    if (this.hashCache.size > size) {
      const entriesToRemove = this.hashCache.size - size;
      const entries = Array.from(this.hashCache.keys());

      for (let i = 0; i < entriesToRemove; i++) {
        this.hashCache.delete(entries[i]!);
      }
    }
  }
}

/**
 * Global crypto service instance
 */
export const crypto = new CryptoService();
