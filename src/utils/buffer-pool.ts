/**
 * Buffer Pool
 *
 * An efficient buffer pool implementation that reuses buffers to reduce garbage collection.
 * This consolidated implementation removes redundancy and optimizes memory usage.
 */

import { Buffer } from 'node:buffer';

/**
 * Buffer pool configuration
 */
export interface BufferPoolConfig {
  /**
   * Default buffer size for new buffers
   * @default 8192 (8KB)
   */
  defaultSize?: number;

  /**
   * Maximum number of buffers to keep in the pool
   * @default 1000
   */
  maxPoolSize?: number;

  /**
   * Maximum size of a single buffer to cache
   * @default 10485760 (10MB)
   */
  maxBufferSize?: number;

  /**
   * Interval in milliseconds to clean up unused buffers
   * @default 30000 (30 seconds)
   */
  cleanupInterval?: number;

  /**
   * Whether to track allocations (useful for debugging)
   * @default false
   */
  trackAllocations?: boolean;
}

/**
 * Buffer allocation statistics
 */
export interface BufferStats {
  /**
   * Total number of buffers allocated
   */
  totalAllocated: number;

  /**
   * Total number of buffers released
   */
  totalReleased: number;

  /**
   * Current number of buffers in use
   */
  currentInUse: number;

  /**
   * Current pool size
   */
  poolSize: number;

  /**
   * Maximum pool size
   */
  maxPoolSize: number;

  /**
   * Total memory in the pool (bytes)
   */
  poolMemory: number;

  /**
   * Number of buffers reused from the pool
   */
  reused: number;

  /**
   * Details about buffer sizes in the pool
   */
  sizeDistribution: Record<number, number>;
}

/**
 * Pool entry interface
 */
interface PoolEntry {
  buffer: Buffer;
  lastUsed: number;
  size: number;
}

/**
 * An efficient buffer pool implementation
 */
export class BufferPool {
  private buffers: PoolEntry[] = [];
  private stats = {
    totalAllocated: 0,
    totalReleased: 0,
    currentInUse: 0,
    reused: 0
  };
  private cleanupTimer: NodeJS.Timeout | null = null;
  private defaultSize: number;
  private maxPoolSize: number;
  private maxBufferSize: number;
  private trackAllocations: boolean;

  /**
   * Create a new buffer pool
   * @param config Pool configuration
   */
  constructor(config: BufferPoolConfig = {}) {
    this.defaultSize = config.defaultSize || 8192;
    this.maxPoolSize = config.maxPoolSize || 1000;
    this.maxBufferSize = config.maxBufferSize || 10 * 1024 * 1024;
    this.trackAllocations = config.trackAllocations || false;

    // Schedule cleanup if interval is provided
    if (config.cleanupInterval) {
      this.startCleanupInterval(config.cleanupInterval);
    }
  }

  /**
   * Get a buffer from the pool or create a new one
   * @param size Size of the buffer to acquire
   * @returns A buffer of the requested size
   */
  acquire(size = this.defaultSize): Buffer {
    if (this.trackAllocations) {
      this.stats.totalAllocated++;
      this.stats.currentInUse++;
    }

    // Find the closest size in the pool
    const index = this.findClosestBuffer(size);

    if (index !== -1) {
      const entry = this.buffers.splice(index, 1)[0]!;

      if (this.trackAllocations) {
        this.stats.reused++;
      }

      // A pooled buffer may be larger than requested — return a right-sized
      // view so callers receive exactly `size` bytes, as documented.
      return entry.buffer.length === size ? entry.buffer : entry.buffer.subarray(0, size);
    }

    // Create a new buffer if none found
    return Buffer.allocUnsafe(size);
  }

  /**
   * Release a buffer back to the pool
   * @param buffer Buffer to release
   * @returns True if the buffer was added to the pool
   */
  release(buffer: Buffer): boolean {
    if (!Buffer.isBuffer(buffer)) {
      return false;
    }

    if (this.trackAllocations) {
      this.stats.totalReleased++;
      this.stats.currentInUse = Math.max(0, this.stats.currentInUse - 1);
    }

    // Don't pool too large buffers
    if (buffer.length > this.maxBufferSize) {
      return false;
    }

    // Don't add more buffers if at capacity
    if (this.buffers.length >= this.maxPoolSize) {
      // Try to find a larger buffer to replace
      const largestIndex = this.findLargestBuffer();

      if (largestIndex !== -1 && this.buffers[largestIndex]!.buffer.length > buffer.length) {
        // Replace the larger buffer with the smaller one
        this.buffers.splice(largestIndex, 1);
      } else {
        return false;
      }
    }

    // Add to pool
    this.buffers.push({
      buffer,
      lastUsed: Date.now(),
      size: buffer.length
    });

    return true;
  }

  /**
   * Reset the buffer pool
   */
  reset(): void {
    this.buffers = [];

    if (this.trackAllocations) {
      this.stats = {
        totalAllocated: 0,
        totalReleased: 0,
        currentInUse: 0,
        reused: 0
      };
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Start automatic cleanup interval
   * @param interval Milliseconds between cleanups
   */
  startCleanupInterval(interval: number): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => this.cleanup(), interval);

    // Prevent keeping the process alive
    this.cleanupTimer.unref();
  }

  /**
   * Cleanup old buffers
   */
  cleanup(): void {
    const now = Date.now();
    const expireTime = now - 30000; // Remove buffers older than 30 seconds

    // Remove older buffers, keeping at least some for immediate reuse
    let _removed = 0;

    if (this.buffers.length > 10) {
      this.buffers = this.buffers.filter(entry => {
        if (entry.lastUsed < expireTime) {
          _removed++;
          return false;
        }
        return true;
      });
    }
  }

  /**
   * Get statistics about buffer usage
   * @returns Buffer pool statistics
   */
  getStats(): BufferStats {
    const sizeDistribution: Record<number, number> = {};
    let poolMemory = 0;

    this.buffers.forEach(entry => {
      poolMemory += entry.size;
      sizeDistribution[entry.size] = (sizeDistribution[entry.size] || 0) + 1;
    });

    return {
      totalAllocated: this.stats.totalAllocated,
      totalReleased: this.stats.totalReleased,
      currentInUse: this.stats.currentInUse,
      poolSize: this.buffers.length,
      maxPoolSize: this.maxPoolSize,
      poolMemory,
      reused: this.stats.reused,
      sizeDistribution
    };
  }

  /**
   * Find a buffer with a size closest to the requested size
   * @param size Requested buffer size
   * @returns Index of the closest buffer or -1 if none found
   * @private
   */
  private findClosestBuffer(size: number): number {
    // Exact match first
    for (let i = 0; i < this.buffers.length; i++) {
      if (this.buffers[i]!.buffer.length === size) {
        return i;
      }
    }

    // Then find the closest larger buffer
    let closestIndex = -1;
    let closestSize = Infinity;

    for (let i = 0; i < this.buffers.length; i++) {
      const bufferSize = this.buffers[i]!.buffer.length;

      if (bufferSize >= size && bufferSize < closestSize) {
        closestIndex = i;
        closestSize = bufferSize;
      }
    }

    return closestIndex;
  }

  /**
   * Find the largest buffer in the pool
   * @returns Index of largest buffer or -1 if pool is empty
   * @private
   */
  private findLargestBuffer(): number {
    if (this.buffers.length === 0) {
      return -1;
    }

    let largestIndex = 0;
    let largestSize = this.buffers[0]!.buffer.length;

    for (let i = 1; i < this.buffers.length; i++) {
      const size = this.buffers[i]!.buffer.length;

      if (size > largestSize) {
        largestIndex = i;
        largestSize = size;
      }
    }

    return largestIndex;
  }
}

/**
 * Global buffer pool instance
 */
export const globalPool = new BufferPool({
  maxPoolSize: 1000,
  trackAllocations: process.env.NODE_ENV === 'development',
  cleanupInterval: 60000 // 1 minute
});
