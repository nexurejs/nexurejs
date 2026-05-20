/**
 * Adaptive Timeout Manager
 *
 * Intelligently adjusts timeout durations based on payload size, processing
 * complexity, and historical processing times.
 */

/**
 * Configuration for AdaptiveTimeoutManager
 */
export interface AdaptiveTimeoutConfig {
  /** Base timeout in milliseconds */
  baseTimeout?: number;
  /** Minimum timeout allowed */
  minTimeout?: number;
  /** Maximum timeout allowed */
  maxTimeout?: number;
  /** Expected processing speed in bytes/ms */
  bytesPerMillisecond?: number;
  /** Multiplier for calculated timeout for safety margin */
  safetyFactor?: number;
  /** Weight given to historical data (0-1) */
  historyWeight?: number;
  /** Number of historical data points to retain */
  historySize?: number;
  /** Whether to adapt to system load */
  adaptToLoad?: boolean;
  /** Interval to check system load */
  loadCheckInterval?: number;
}

interface TimeoutOptions {
  /** Size of payload in bytes */
  size?: number;
  /** Content type */
  contentType?: string;
  /** Operation type */
  operation?: string;
  /** Processing complexity factor (1.0 = normal) */
  complexity?: number;
}

interface ProcessingTimeData {
  /** Size of processed payload in bytes */
  size: number;
  /** Content type */
  contentType: string;
  /** Operation type */
  operation: string;
  /** Actual processing duration in milliseconds */
  duration: number;
}

interface HistoryEntry {
  avgBytesPerMs: number;
  samples: Array<{
    timestamp: number;
    bytesPerMs: number;
    size: number;
    duration: number;
  }>;
}

export interface TimeoutHandlerOptions {
  /** Payload size in bytes */
  size: number;
  /** Content type */
  contentType: string;
  /** Operation type */
  operation: string;
  /** Callback when timeout occurs */
  onTimeout: () => void;
}

export interface TimeoutHandler {
  /** Start the timeout */
  start: () => number;
  /** Clear the timeout */
  clear: (recordSuccess?: boolean) => number;
  /** Extend the timeout */
  extend: (percentageIncrease?: number) => number;
  /** Get timeout information */
  getInfo: () => {
    timeout: number;
    elapsed: number;
    remaining: number;
    hasTimedOut: boolean;
  };
}

/**
 * Manages adaptive timeouts based on payload size and processing history
 */
export class AdaptiveTimeoutManager {
  private config: Required<AdaptiveTimeoutConfig>;
  private history: Map<string, HistoryEntry>;
  private loadFactor: number;
  private loadMonitorInterval: NodeJS.Timeout | null;

  /**
   * Create a new adaptive timeout manager
   */
  constructor(config: AdaptiveTimeoutConfig = {}) {
    this.config = {
      baseTimeout: config.baseTimeout || 30000,
      minTimeout: config.minTimeout || 1000,
      maxTimeout: config.maxTimeout || 120000,
      bytesPerMillisecond: config.bytesPerMillisecond || 1024, // 1KB per ms
      safetyFactor: config.safetyFactor || 1.5,
      historyWeight: config.historyWeight || 0.7,
      historySize: config.historySize || 100,
      adaptToLoad: config.adaptToLoad !== false,
      loadCheckInterval: config.loadCheckInterval || 5000
    };

    // Processing history by content type
    this.history = new Map();

    // Current system load factor (1.0 = normal)
    this.loadFactor = 1.0;

    // Initialize load monitor interval as null
    this.loadMonitorInterval = null;

    // Start load monitoring if enabled
    if (this.config.adaptToLoad) {
      this.startLoadMonitoring();
    }
  }

  /**
   * Calculate timeout for a specific operation
   * @returns Recommended timeout in milliseconds
   */
  calculateTimeout({
    size = 0,
    contentType = 'application/octet-stream',
    operation = 'process',
    complexity = 1
  }: TimeoutOptions = {}): number {
    // Normalize content type to a category
    const category = this.normalizeContentType(contentType || 'application/octet-stream');
    const key = `${category}-${operation}`;

    // Get historical data for this category and operation
    const historyData = this.history.get(key) || {
      avgBytesPerMs: this.config.bytesPerMillisecond,
      samples: []
    };

    // Calculate base timeout from size and processing speed
    const baseTimeoutFromSize = size / historyData.avgBytesPerMs;

    // Factor in complexity
    const rawTimeout = baseTimeoutFromSize * complexity;

    // Apply safety factor and system load
    const adjustedTimeout = rawTimeout * this.config.safetyFactor * this.loadFactor;

    // Add base timeout and clamp to limits
    const finalTimeout = Math.min(
      Math.max(adjustedTimeout + this.config.baseTimeout, this.config.minTimeout),
      this.config.maxTimeout
    );

    return Math.ceil(finalTimeout);
  }

  /**
   * Record processing time for a completed operation
   */
  recordProcessingTime({ size, contentType, operation, duration }: ProcessingTimeData): void {
    if (!size || !duration) return;

    // Normalize content type to a category
    const category = this.normalizeContentType(contentType);
    const key = `${category}-${operation}`;

    // Get or create history entry
    if (!this.history.has(key)) {
      this.history.set(key, {
        avgBytesPerMs: this.config.bytesPerMillisecond,
        samples: []
      });
    }

    const historyData = this.history.get(key)!;

    // Calculate bytes per millisecond for this operation
    const bytesPerMs = size / duration;

    // Add to samples
    historyData.samples.push({
      timestamp: Date.now(),
      bytesPerMs,
      size,
      duration
    });

    // Trim history if needed
    if (historyData.samples.length > this.config.historySize) {
      historyData.samples = historyData.samples.slice(-this.config.historySize);
    }

    // Update average with weighted approach
    // New avg = (old avg * weight) + (new value * (1 - weight))
    historyData.avgBytesPerMs =
      historyData.avgBytesPerMs * this.config.historyWeight +
      bytesPerMs * (1 - this.config.historyWeight);

    // Update history
    this.history.set(key, historyData);
  }

  /**
   * Start monitoring system load
   * @private
   */
  private startLoadMonitoring(): void {
    // Check system load periodically
    this.loadMonitorInterval = setInterval(() => {
      this.updateSystemLoad();
    }, this.config.loadCheckInterval);

    // Prevent interval from keeping process alive
    this.loadMonitorInterval.unref();

    // Initial load check
    this.updateSystemLoad();
  }

  /**
   * Stop load monitoring
   */
  stopLoadMonitoring(): void {
    if (this.loadMonitorInterval) {
      clearInterval(this.loadMonitorInterval);
      this.loadMonitorInterval = null;
    }
  }

  /**
   * Update system load factor
   * @private
   */
  private updateSystemLoad(): void {
    try {
      // Measure event-loop lag as a proxy for system load. A setTimeout(…, 0)
      // callback is delayed when the loop is congested; process.nextTick runs
      // before the loop continues and therefore cannot measure lag at all.
      const startTime = Date.now();

      setTimeout(() => {
        const lag = Date.now() - startTime;

        // Convert lag to a load factor
        // 0-1ms lag = 1.0 (normal)
        // 10ms lag = 1.2 (20% increase)
        // 50ms lag = 2.0 (100% increase)
        // 100ms lag = 3.0 (200% increase)
        if (lag <= 1) {
          this.loadFactor = 1.0;
        } else if (lag <= 10) {
          this.loadFactor = 1.0 + (lag - 1) * 0.02; // +2% per ms over 1ms
        } else if (lag <= 50) {
          this.loadFactor = 1.2 + (lag - 10) * 0.02; // +2% per ms over 10ms
        } else if (lag <= 100) {
          this.loadFactor = 2.0 + (lag - 50) * 0.02; // +2% per ms over 50ms
        } else {
          this.loadFactor = 3.0;
        }
      }, 0);
    } catch (_err) {
      // Fallback if measurement fails
      this.loadFactor = 1.2; // Conservative 20% increase
    }
  }

  /**
   * Create a timeout handler for an operation
   * @returns Timeout handler with start, clear, and extend methods
   */
  createTimeoutHandler({
    size,
    contentType,
    operation,
    onTimeout
  }: TimeoutHandlerOptions): TimeoutHandler {
    // Calculate initial timeout
    const timeout = this.calculateTimeout({
      size,
      contentType,
      operation
    });

    let timeoutId: NodeJS.Timeout | null = null;
    let startTime = 0;
    let hasTimedOut = false;

    return {
      /**
       * Start the timeout
       * @returns Timeout duration in ms
       */
      start: (): number => {
        // Clear any existing timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        startTime = Date.now();
        hasTimedOut = false;

        timeoutId = setTimeout(() => {
          hasTimedOut = true;
          if (typeof onTimeout === 'function') {
            onTimeout();
          }
        }, timeout);

        return timeout;
      },

      /**
       * Clear the timeout
       * @param recordSuccess Whether to record this as a successful operation
       * @returns Duration of processing in ms
       */
      clear: (recordSuccess = true): number => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        const duration = Date.now() - startTime;

        if (recordSuccess && startTime > 0 && !hasTimedOut) {
          // Record successful processing time for future timeout calculations
          this.recordProcessingTime({
            size,
            contentType,
            operation,
            duration
          });
        }

        return duration;
      },

      /**
       * Extend the timeout
       * @param percentageIncrease Percentage to increase timeout by
       * @returns New timeout duration in ms
       */
      extend: (percentageIncrease = 50): number => {
        if (!timeoutId || hasTimedOut) {
          return 0;
        }

        clearTimeout(timeoutId);

        // Calculate remaining time
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, timeout - elapsed);

        // Add percentage increase
        const extension = remaining * (percentageIncrease / 100);
        const newTimeout = remaining + extension;

        timeoutId = setTimeout(() => {
          hasTimedOut = true;
          if (typeof onTimeout === 'function') {
            onTimeout();
          }
        }, newTimeout);

        return newTimeout;
      },

      /**
       * Get timeout information
       * @returns Timeout details
       */
      getInfo: () => ({
        timeout,
        elapsed: startTime > 0 ? Date.now() - startTime : 0,
        remaining: timeoutId ? Math.max(0, timeout - (Date.now() - startTime)) : 0,
        hasTimedOut
      })
    };
  }

  /**
   * Normalize content type to a category
   * @param contentType Content type to normalize
   * @returns Normalized content type category
   */
  private normalizeContentType(contentType: string): string {
    // Extract base content type
    const parts = contentType.split(';');
    const baseType = parts.length > 0 ? parts[0]!.trim().toLowerCase() : '';

    // Group into categories
    if (baseType.includes('json')) return 'json';
    if (baseType.includes('xml')) return 'xml';
    if (baseType.includes('text')) return 'text';
    if (baseType.includes('form')) return 'form';
    if (baseType.includes('multipart')) return 'multipart';
    if (baseType.includes('image')) return 'image';

    return 'binary';
  }

  /**
   * Get performance statistics
   * @returns Statistics about timeout calculations
   */
  getStats(): {
    categories: Array<{
      category: string;
      avgBytesPerMs: number;
      samples: number;
      avgSize: number;
      avgDuration: number;
    }>;
    loadFactor: number;
    global: {
      totalSamples: number;
      avgBytesPerMs: number;
      avgProcessingSpeed: string;
    };
  } {
    // Calculate per-category statistics
    const categories = Array.from(this.history.entries()).map(([key, data]) => {
      // Calculate averages
      let totalSize = 0;
      let totalDuration = 0;

      for (const sample of data.samples) {
        totalSize += sample.size;
        totalDuration += sample.duration;
      }

      const avgSize = data.samples.length > 0 ? totalSize / data.samples.length : 0;
      const avgDuration = data.samples.length > 0 ? totalDuration / data.samples.length : 0;

      return {
        category: key,
        avgBytesPerMs: data.avgBytesPerMs,
        samples: data.samples.length,
        avgSize,
        avgDuration
      };
    });

    // Calculate global statistics
    let totalSamples = 0;
    let totalBytesPerMs = 0;

    for (const category of categories) {
      totalSamples += category.samples;
      totalBytesPerMs += category.avgBytesPerMs;
    }

    const avgBytesPerMs =
      categories.length > 0 ? totalBytesPerMs / categories.length : this.config.bytesPerMillisecond;
    const avgMBPerSecond = (avgBytesPerMs * 1000) / (1024 * 1024);

    return {
      categories,
      loadFactor: this.loadFactor,
      global: {
        totalSamples,
        avgBytesPerMs,
        avgProcessingSpeed: `${avgMBPerSecond.toFixed(2)} MB/s`
      }
    };
  }

  /**
   * Clear processing history
   */
  clearHistory(): void {
    this.history.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopLoadMonitoring();
    this.clearHistory();
  }
}

// Create a global instance of the timeout manager
export const globalTimeoutManager = new AdaptiveTimeoutManager();

export default AdaptiveTimeoutManager;
