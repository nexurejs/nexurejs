/**
 * Native Compression Module Wrapper
 *
 * Provides TypeScript interface for the native compression module
 * with automatic fallback to Node.js zlib when native module is unavailable.
 */

import { loadNativeBinding, getNativeModuleStatus } from './index.js';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';

// Promisified zlib functions for fallback
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Compression class that wraps native module with JS fallback
 */
export class CompressionWrapper {
  private useNative: boolean;
  private nativeModule: any;

  // Performance metrics
  private static jsCompressTime = 0;
  private static jsCompressCount = 0;
  private static jsDecompressTime = 0;
  private static jsDecompressCount = 0;
  private static nativeCompressTime = 0;
  private static nativeCompressCount = 0;
  private static nativeDecompressTime = 0;
  private static nativeDecompressCount = 0;

  constructor() {
    const nativeModule = loadNativeBinding();
    const status = getNativeModuleStatus();
    this.useNative = Boolean(nativeModule && nativeModule.compress && nativeModule.decompress);
    this.nativeModule = nativeModule;
  }

  /**
   * Compress data using gzip
   * @param data Input data as Buffer or string
   * @param level Compression level (0-9, default: 6)
   * @returns Compressed data as Buffer
   */
  async compress(data: Buffer | string, level: number = 6): Promise<Buffer> {
    const start = performance.now();
    let result: Buffer;

    if (this.useNative && this.nativeModule) {
      try {
        result = this.nativeModule.compress(data, level);
        CompressionWrapper.nativeCompressTime += performance.now() - start;
        CompressionWrapper.nativeCompressCount++;
      } catch (err) {
        // Fallback to JS on error
        result = await gzip(data, { level });
        CompressionWrapper.jsCompressTime += performance.now() - start;
        CompressionWrapper.jsCompressCount++;
      }
    } else {
      result = await gzip(data, { level });
      CompressionWrapper.jsCompressTime += performance.now() - start;
      CompressionWrapper.jsCompressCount++;
    }

    return result;
  }

  /**
   * Decompress gzip data
   * @param data Compressed data as Buffer
   * @returns Decompressed data as Buffer
   */
  async decompress(data: Buffer): Promise<Buffer> {
    const start = performance.now();
    let result: Buffer;

    if (this.useNative && this.nativeModule) {
      try {
        result = this.nativeModule.decompress(data);
        CompressionWrapper.nativeDecompressTime += performance.now() - start;
        CompressionWrapper.nativeDecompressCount++;
      } catch (err) {
        // Fallback to JS on error
        result = await gunzip(data);
        CompressionWrapper.jsDecompressTime += performance.now() - start;
        CompressionWrapper.jsDecompressCount++;
      }
    } else {
      result = await gunzip(data);
      CompressionWrapper.jsDecompressTime += performance.now() - start;
      CompressionWrapper.jsDecompressCount++;
    }

    return result;
  }

  /**
   * Synchronous compress (native only)
   */
  compressSync(data: Buffer | string, level: number = 6): Buffer {
    if (this.useNative && this.nativeModule) {
      const start = performance.now();
      const result = this.nativeModule.compress(data, level);
      CompressionWrapper.nativeCompressTime += performance.now() - start;
      CompressionWrapper.nativeCompressCount++;
      return result;
    } else {
      return zlib.gzipSync(data, { level });
    }
  }

  /**
   * Synchronous decompress (native only)
   */
  decompressSync(data: Buffer): Buffer {
    if (this.useNative && this.nativeModule) {
      const start = performance.now();
      const result = this.nativeModule.decompress(data);
      CompressionWrapper.nativeDecompressTime += performance.now() - start;
      CompressionWrapper.nativeDecompressCount++;
      return result;
    } else {
      return zlib.gunzipSync(data);
    }
  }

  /**
   * Get performance metrics
   */
  static getPerformanceMetrics(): {
    jsCompressTime: number;
    jsCompressCount: number;
    jsDecompressTime: number;
    jsDecompressCount: number;
    nativeCompressTime: number;
    nativeCompressCount: number;
    nativeDecompressTime: number;
    nativeDecompressCount: number;
  } {
    return {
      jsCompressTime: CompressionWrapper.jsCompressTime,
      jsCompressCount: CompressionWrapper.jsCompressCount,
      jsDecompressTime: CompressionWrapper.jsDecompressTime,
      jsDecompressCount: CompressionWrapper.jsDecompressCount,
      nativeCompressTime: CompressionWrapper.nativeCompressTime,
      nativeCompressCount: CompressionWrapper.nativeCompressCount,
      nativeDecompressTime: CompressionWrapper.nativeDecompressTime,
      nativeDecompressCount: CompressionWrapper.nativeDecompressCount
    };
  }

  /**
   * Reset performance metrics
   */
  static resetPerformanceMetrics(): void {
    CompressionWrapper.jsCompressTime = 0;
    CompressionWrapper.jsCompressCount = 0;
    CompressionWrapper.jsDecompressTime = 0;
    CompressionWrapper.jsDecompressCount = 0;
    CompressionWrapper.nativeCompressTime = 0;
    CompressionWrapper.nativeCompressCount = 0;
    CompressionWrapper.nativeDecompressTime = 0;
    CompressionWrapper.nativeDecompressCount = 0;
  }

  /**
   * Check if using native implementation
   */
  isNative(): boolean {
    return this.useNative;
  }
}
