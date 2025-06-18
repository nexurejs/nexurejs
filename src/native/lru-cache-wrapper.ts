/**
 * Native LRU Cache Module Wrapper
 *
 * Provides TypeScript interface for the native LRU cache module
 * with automatic fallback to JavaScript Map-based implementation.
 */

import { loadNativeBinding, getNativeModuleStatus } from './index.js';

interface CacheOptions {
  capacity?: number;
  ttl?: number; // Time to live in milliseconds
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  insertions: number;
  updates: number;
  hitRatio: number;
  size: number;
  capacity: number;
}

/**
 * JavaScript fallback implementation
 */
class JsLRUCache<T = any> {
  private capacity: number;
  private ttl: number;
  private cache: Map<string, { value: T; timestamp: number; expiry?: number }>;
  private metrics: CacheMetrics;

  constructor(options: CacheOptions = {}) {
    this.capacity = options.capacity || 1000;
    this.ttl = options.ttl || 0;
    this.cache = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      insertions: 0,
      updates: 0,
      hitRatio: 0,
      size: 0,
      capacity: this.capacity
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Check expiry
    if (entry.expiry && Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.metrics.expirations++;
      this.metrics.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Move to end (most recent)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.metrics.hits++;
    this.updateHitRatio();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const effectiveTtl = ttl !== undefined ? ttl : this.ttl;
    const expiry = effectiveTtl > 0 ? Date.now() + effectiveTtl : undefined;

    if (this.cache.has(key)) {
      this.metrics.updates++;
    } else {
      this.metrics.insertions++;

      // Check capacity
      if (this.cache.size >= this.capacity) {
        // Remove oldest (first) entry
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
        this.metrics.evictions++;
      }
    }

    this.cache.set(key, { value, timestamp: Date.now(), expiry });
    this.updateMetrics();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiry
    if (entry.expiry && Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.metrics.expirations++;
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.updateMetrics();
    return result;
  }

  clear(): void {
    this.cache.clear();
    this.resetMetrics();
  }

  getSize(): number {
    return this.cache.size;
  }

  getCapacity(): number {
    return this.capacity;
  }

  setCapacity(capacity: number): number {
    this.capacity = capacity;

    // Evict if necessary
    while (this.cache.size > this.capacity) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.metrics.evictions++;
    }

    this.updateMetrics();
    return this.capacity;
  }

  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  getValues(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  getEntries(): Array<{ key: string; value: T }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      value: entry.value
    }));
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      insertions: 0,
      updates: 0,
      hitRatio: 0,
      size: this.cache.size,
      capacity: this.capacity
    };
  }

  pruneExpired(): number {
    const now = Date.now();
    let expired = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry && now > entry.expiry) {
        this.cache.delete(key);
        this.metrics.expirations++;
        expired++;
      }
    }

    this.updateMetrics();
    return this.cache.size;
  }

  private updateHitRatio(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRatio = total > 0 ? this.metrics.hits / total : 0;
  }

  private updateMetrics(): void {
    this.metrics.size = this.cache.size;
    this.metrics.capacity = this.capacity;
    this.updateHitRatio();
  }
}

/**
 * LRU Cache class that wraps native module with JS fallback
 */
export class LRUCacheWrapper<T = any> {
  private cache: any;
  private useNative: boolean;

  // Performance metrics
  private static jsTime = 0;
  private static jsCount = 0;
  private static nativeTime = 0;
  private static nativeCount = 0;

  constructor(options: CacheOptions = {}) {
    const nativeModule = loadNativeBinding();
    const status = getNativeModuleStatus();
    this.useNative = Boolean(nativeModule && nativeModule.LRUCache && status.lruCache);

    if (this.useNative) {
      try {
        this.cache = new nativeModule.LRUCache(options);
      } catch (err) {
        // Fallback to JS implementation
        this.useNative = false;
        this.cache = new JsLRUCache<T>(options);
      }
    } else {
      this.cache = new JsLRUCache<T>(options);
    }
  }

  get(key: string): T | undefined {
    const start = performance.now();
    const result = this.cache.get(key);

    if (this.useNative) {
      LRUCacheWrapper.nativeTime += performance.now() - start;
      LRUCacheWrapper.nativeCount++;
    } else {
      LRUCacheWrapper.jsTime += performance.now() - start;
      LRUCacheWrapper.jsCount++;
    }

    return result;
  }

  set(key: string, value: T, ttl?: number): void {
    const start = performance.now();
    this.cache.set(key, value, ttl);

    if (this.useNative) {
      LRUCacheWrapper.nativeTime += performance.now() - start;
      LRUCacheWrapper.nativeCount++;
    } else {
      LRUCacheWrapper.jsTime += performance.now() - start;
      LRUCacheWrapper.jsCount++;
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.getSize();
  }

  getCapacity(): number {
    return this.cache.getCapacity();
  }

  setCapacity(capacity: number): number {
    return this.cache.setCapacity(capacity);
  }

  getKeys(): string[] {
    return this.cache.getKeys();
  }

  getValues(): T[] {
    return this.cache.getValues();
  }

  getEntries(): Array<{ key: string; value: T }> {
    return this.cache.getEntries();
  }

  getMetrics(): CacheMetrics {
    return this.cache.getMetrics();
  }

  resetMetrics(): void {
    this.cache.resetMetrics();
  }

  pruneExpired(): number {
    return this.cache.pruneExpired();
  }

  /**
   * Get performance metrics
   */
  static getPerformanceMetrics(): {
    jsTime: number;
    jsCount: number;
    nativeTime: number;
    nativeCount: number;
  } {
    return {
      jsTime: LRUCacheWrapper.jsTime,
      jsCount: LRUCacheWrapper.jsCount,
      nativeTime: LRUCacheWrapper.nativeTime,
      nativeCount: LRUCacheWrapper.nativeCount
    };
  }

  /**
   * Reset performance metrics
   */
  static resetPerformanceMetrics(): void {
    LRUCacheWrapper.jsTime = 0;
    LRUCacheWrapper.jsCount = 0;
    LRUCacheWrapper.nativeTime = 0;
    LRUCacheWrapper.nativeCount = 0;
  }

  /**
   * Check if using native implementation
   */
  isNative(): boolean {
    return this.useNative;
  }

  /**
   * Get singleton instance
   */
  static getInstance<T = any>(options?: CacheOptions): LRUCacheWrapper<T> {
    const nativeModule = loadNativeBinding();
    if (nativeModule && nativeModule.LRUCache && nativeModule.LRUCache.getInstance) {
      return nativeModule.LRUCache.getInstance(options);
    }

    // Fallback to creating new instance
    return new LRUCacheWrapper<T>(options);
  }
}
