/**
 * Performance monitoring utility
 */

import { EventEmitter } from 'node:events';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { Logger } from './logger.js';

/**
 * Performance metric
 */
export interface PerformanceMetric {
  /**
   * Metric name
   */
  name: string;

  /**
   * Metric value
   */
  value: number;

  /**
   * Metric unit
   */
  unit: string;

  /**
   * Metric timestamp
   */
  timestamp: number;
}

/**
 * Performance monitor options
 */
export interface PerformanceMonitorOptions {
  /**
   * Enable memory monitoring
   * @default true
   */
  memoryMonitoring?: boolean;

  /**
   * Memory monitoring interval in milliseconds
   * @default 30000 (30 seconds)
   */
  memoryMonitoringInterval?: number;

  /**
   * Enable event loop monitoring
   * @default true
   */
  eventLoopMonitoring?: boolean;

  /**
   * Event loop monitoring interval in milliseconds
   * @default 5000 (5 seconds)
   */
  eventLoopMonitoringInterval?: number;

  /**
   * Enable GC monitoring
   * @default false
   */
  gcMonitoring?: boolean;
}

/**
 * Enhanced memory metrics to track potential memory leaks
 */
export interface EnhancedMemoryMetrics {
  /** Current RSS memory usage in bytes */
  rss: number;

  /** Current heap total in bytes */
  heapTotal: number;

  /** Current heap used in bytes */
  heapUsed: number;

  /** Current external memory in bytes */
  external: number;

  /** Array buffer memory in bytes */
  arrayBuffers: number;

  /** Memory growth since last measurement in bytes */
  growth: number;

  /** Growth rate per second in bytes */
  growthRate: number;

  /** Leak score from 0-100 (higher means more likely leak) */
  leakScore: number;
}

/**
 * Performance monitor for benchmarking and profiling
 */
export class PerformanceMonitor extends EventEmitter {
  private logger = new Logger();
  private marks = new Map<string, number>();
  private measures = new Map<string, PerformanceMetric[]>();
  private memoryMonitoringInterval?: NodeJS.Timeout;
  private eventLoopMonitoringInterval?: NodeJS.Timeout;
  private observer?: PerformanceObserver;
  private lastMemoryUsage: NodeJS.MemoryUsage | null = null;
  private memoryGrowthHistory: number[] = [];
  private memoryCheckInterval: number = 0;
  private leakDetectionEnabled: boolean = false;
  private leakDetectionThreshold: number = 10 * 1024 * 1024; // 10MB
  private memoryGrowthTime: number = 0;

  /**
   * Create a new performance monitor
   * @param options Performance monitor options
   */
  constructor(private options: PerformanceMonitorOptions = {}) {
    super();

    // Set default options
    this.options.memoryMonitoring = options.memoryMonitoring !== false;
    this.options.memoryMonitoringInterval = options.memoryMonitoringInterval || 30000;
    this.options.eventLoopMonitoring = options.eventLoopMonitoring !== false;
    this.options.eventLoopMonitoringInterval = options.eventLoopMonitoringInterval || 5000;
    this.options.gcMonitoring = options.gcMonitoring === true;
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.logger.info('Starting performance monitoring');

    // Start memory monitoring
    if (this.options.memoryMonitoring) {
      this.startMemoryMonitoring();
    }

    // Start event loop monitoring
    if (this.options.eventLoopMonitoring) {
      this.startEventLoopMonitoring();
    }

    // Start GC monitoring
    if (this.options.gcMonitoring) {
      this.startGcMonitoring();
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.logger.info('Stopping performance monitoring');

    // Stop memory monitoring
    if (this.memoryMonitoringInterval) {
      clearInterval(this.memoryMonitoringInterval);
      this.memoryMonitoringInterval = undefined;
    }

    // Stop event loop monitoring
    if (this.eventLoopMonitoringInterval) {
      clearInterval(this.eventLoopMonitoringInterval);
      this.eventLoopMonitoringInterval = undefined;
    }

    // Stop GC monitoring
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.logger.info(
      `Starting memory monitoring (interval: ${this.options.memoryMonitoringInterval}ms)`
    );

    // Monitor memory usage
    this.memoryMonitoringInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();

      // Record metrics
      this.recordMetric('memory.rss', memoryUsage.rss, 'bytes');
      this.recordMetric('memory.heapTotal', memoryUsage.heapTotal, 'bytes');
      this.recordMetric('memory.heapUsed', memoryUsage.heapUsed, 'bytes');
      this.recordMetric('memory.external', memoryUsage.external, 'bytes');

      // Emit event
      this.emit('memory', memoryUsage);
    }, this.options.memoryMonitoringInterval);
  }

  /**
   * Start event loop monitoring
   */
  private startEventLoopMonitoring(): void {
    this.logger.info(
      `Starting event loop monitoring (interval: ${this.options.eventLoopMonitoringInterval}ms)`
    );

    let lastCheck = performance.now();

    // Monitor event loop lag
    this.eventLoopMonitoringInterval = setInterval(() => {
      const now = performance.now();
      const delta = now - lastCheck;
      const lag = delta - this.options.eventLoopMonitoringInterval!;

      // Record metric
      this.recordMetric('eventLoop.lag', lag, 'ms');

      // Emit event
      this.emit('eventLoop', { lag });

      lastCheck = now;
    }, this.options.eventLoopMonitoringInterval);
  }

  /**
   * Start GC monitoring
   */
  private startGcMonitoring(): void {
    try {
      // Create performance observer
      this.observer = new PerformanceObserver(list => {
        const entries = list.getEntries();

        for (const entry of entries) {
          // Record metric
          this.recordMetric(`gc.${entry.name}`, entry.duration, 'ms');

          // Emit event
          this.emit('gc', {
            type: entry.name,
            duration: entry.duration
          });
        }
      });

      // Subscribe to GC events
      this.observer.observe({ entryTypes: ['gc'] });

      this.logger.info('GC monitoring started');
    } catch (error) {
      this.logger.error(`Failed to start GC monitoring: ${(error as Error).message}`);
    }
  }

  /**
   * Record a performance metric
   * @param name The metric name
   * @param value The metric value
   * @param unit The metric unit
   */
  recordMetric(name: string, value: number, unit: string): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now()
    };

    // Store the metric
    const metrics = this.measures.get(name) || [];
    metrics.push(metric);
    this.measures.set(name, metrics);

    // Emit event
    this.emit('metric', metric);
  }

  /**
   * Mark a point in time
   * @param name The mark name
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * Measure the time between two marks
   * @param name The measure name
   * @param startMark The start mark name
   * @param endMark The end mark name (defaults to now)
   */
  measure(name: string, startMark: string, endMark?: string): number {
    const startTime = this.marks.get(startMark);

    if (!startTime) {
      throw new Error(`Mark not found: ${startMark}`);
    }

    const endTime = endMark ? this.marks.get(endMark) : performance.now();

    if (endMark && !endTime) {
      throw new Error(`Mark not found: ${endMark}`);
    }

    const duration = endTime! - startTime;

    // Record metric
    this.recordMetric(`measure.${name}`, duration, 'ms');

    return duration;
  }

  /**
   * Get metrics by name
   * @param name The metric name
   */
  getMetrics(name: string): PerformanceMetric[] {
    return this.measures.get(name) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, PerformanceMetric[]> {
    const result: Record<string, PerformanceMetric[]> = {};

    for (const [name, metrics] of this.measures.entries()) {
      result[name] = metrics;
    }

    return result;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.measures.clear();
  }

  /**
   * Clear all marks
   */
  clearMarks(): void {
    this.marks.clear();
  }

  /**
   * Clear everything
   */
  clear(): void {
    this.clearMetrics();
    this.clearMarks();
  }

  /**
   * Create a performance report
   */
  createReport(): Record<string, any> {
    const report: Record<string, any> = {
      timestamp: new Date().toISOString(),
      metrics: {}
    };

    // Add metrics
    for (const [name, metrics] of this.measures.entries()) {
      if (metrics.length === 0) continue;

      // Calculate statistics
      const values = metrics.map(m => m.value);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      // Add to report
      report.metrics[name] = {
        count: metrics.length,
        min,
        max,
        avg,
        sum,
        unit: metrics[0]!.unit,
        latest: metrics[metrics.length - 1]!.value
      };
    }

    // Add enhanced memory metrics to the report
    if (this.options.memoryMonitoring) {
      report.memory = this.getEnhancedMemoryMetrics();
    }

    return report;
  }

  /**
   * Enable memory leak detection
   * @param interval Check interval in milliseconds
   * @param threshold Growth threshold to consider a leak (bytes)
   */
  enableLeakDetection(interval: number = 30000, threshold: number = 10 * 1024 * 1024): void {
    this.leakDetectionEnabled = true;
    this.memoryCheckInterval = interval;
    this.leakDetectionThreshold = threshold;

    // Start periodic checks
    this.checkMemoryGrowth();

    // Set up interval for continuous monitoring
    setInterval(() => {
      this.checkMemoryGrowth();
    }, this.memoryCheckInterval);

    this.logger.debug('Memory leak detection enabled', {
      interval,
      threshold: `${Math.round(threshold / (1024 * 1024))}MB`
    });
  }

  /**
   * Check for memory growth that could indicate leaks
   */
  private checkMemoryGrowth(): void {
    if (!this.leakDetectionEnabled) return;

    const currentMemory = process.memoryUsage();
    const now = performance.now();

    if (!this.lastMemoryUsage) {
      // First check, just store the baseline
      this.lastMemoryUsage = currentMemory;
      this.memoryGrowthTime = now;
      return;
    }

    // Calculate growth
    const growth = currentMemory.heapUsed - this.lastMemoryUsage.heapUsed;
    const timeDelta = now - this.memoryGrowthTime;
    const growthRate = growth / (timeDelta / 1000); // bytes per second

    // Store in history (keep last 5 measurements)
    this.memoryGrowthHistory.push(growth);
    if (this.memoryGrowthHistory.length > 5) {
      this.memoryGrowthHistory.shift();
    }

    // Calculate leak score (0-100)
    // Higher score means more likely memory leak
    let leakScore = 0;

    // Factor 1: Consistent positive growth
    const positiveGrowthCount = this.memoryGrowthHistory.filter(g => g > 0).length;
    leakScore += (positiveGrowthCount / this.memoryGrowthHistory.length) * 40;

    // Factor 2: Growth rate relative to threshold
    const growthOverThreshold = Math.min(growthRate / (this.leakDetectionThreshold / 60), 1);
    leakScore += growthOverThreshold * 40;

    // Factor 3: Heap used to heap total ratio
    const heapUsedRatio = currentMemory.heapUsed / currentMemory.heapTotal;
    leakScore += heapUsedRatio * 20;

    // Round to nearest integer
    leakScore = Math.round(leakScore);

    // Record memory metrics
    this.recordMetric('memory.rss', currentMemory.rss, 'bytes');
    this.recordMetric('memory.heapTotal', currentMemory.heapTotal, 'bytes');
    this.recordMetric('memory.heapUsed', currentMemory.heapUsed, 'bytes');
    this.recordMetric('memory.external', currentMemory.external, 'bytes');
    this.recordMetric('memory.arrayBuffers', currentMemory.arrayBuffers || 0, 'bytes');
    this.recordMetric('memory.growth', growth, 'bytes');
    this.recordMetric('memory.growthRate', growthRate, 'bytes/s');
    this.recordMetric('memory.leakScore', leakScore, '');

    // Emit warnings for potential leaks
    if (leakScore > 70) {
      this.emit('warning', {
        type: 'memory',
        message: `Potential memory leak detected (score: ${leakScore}/100)`,
        metrics: this.getEnhancedMemoryMetrics()
      });

      this.logger.warn(`Potential memory leak detected (score: ${leakScore}/100)`, {
        growth: `${Math.round(growth / 1024)}KB`,
        growthRate: `${Math.round(growthRate / 1024)}KB/s`,
        heapUsed: `${Math.round(currentMemory.heapUsed / (1024 * 1024))}MB`,
        heapTotal: `${Math.round(currentMemory.heapTotal / (1024 * 1024))}MB`
      });
    }

    // Update for next check
    this.lastMemoryUsage = currentMemory;
    this.memoryGrowthTime = now;
  }

  /**
   * Get enhanced memory metrics with leak detection info
   */
  getEnhancedMemoryMetrics(): EnhancedMemoryMetrics {
    const memory = process.memoryUsage();

    // Calculate growth since last check
    let growth = 0;
    let growthRate = 0;
    let leakScore = 0;

    if (this.lastMemoryUsage) {
      growth = memory.heapUsed - this.lastMemoryUsage.heapUsed;
      const timeDelta = performance.now() - this.memoryGrowthTime;
      growthRate = growth / (timeDelta / 1000);

      // Calculate leak score (simplified version)
      const positiveGrowthCount = this.memoryGrowthHistory.filter(g => g > 0).length;
      leakScore += (positiveGrowthCount / Math.max(this.memoryGrowthHistory.length, 1)) * 40;

      const growthOverThreshold = Math.min(growthRate / (this.leakDetectionThreshold / 60), 1);
      leakScore += growthOverThreshold * 40;

      const heapUsedRatio = memory.heapUsed / memory.heapTotal;
      leakScore += heapUsedRatio * 20;

      leakScore = Math.round(leakScore);
    }

    return {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers || 0,
      growth,
      growthRate,
      leakScore
    };
  }
}
