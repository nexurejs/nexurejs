/**
 * Performance Benchmarking Tool
 *
 * A comprehensive benchmarking utility for measuring code performance in NexureJS.
 * Allows developers to identify bottlenecks and optimize code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { cpus } from 'os';

/**
 * Benchmark options
 */
export interface BenchmarkOptions {
  /** Name of the benchmark */
  name: string;
  /** Description of what's being benchmarked */
  description?: string;
  /** Number of iterations to run (default: 1000) */
  iterations?: number;
  /** Number of warmup iterations to run before measuring (default: 10) */
  warmup?: number;
  /** Time budget in ms (will stop after this time regardless of iterations) */
  timeBudget?: number;
  /** Whether to collect memory usage statistics */
  collectMemoryStats?: boolean;
  /** Whether to collect CPU usage statistics */
  collectCpuStats?: boolean;
  /** Whether to optimize the code before benchmarking */
  optimize?: boolean;
  /** Whether to use Node.js performance trace */
  usePerformanceTrace?: boolean;
}

/**
 * Enhanced performance monitoring for native optimizations
 */
export interface BenchmarkResult {
  name: string;
  operationsPerSecond: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  iterations: number;
  memoryUsed: number;
  usedSIMD: boolean;
  cpuUtilization: number;
  throughputMBps?: number;
}

export interface SIMDBenchmarkResult extends BenchmarkResult {
  simdSpeedup: number;
  vectorizationEfficiency: number;
  cacheHitRate: number;
}

export interface NativeModuleBenchmarks {
  simdOptimizer: SIMDBenchmarkResult[];
  jsonProcessor: BenchmarkResult[];
  compressionEngine: BenchmarkResult[];
  httpParser: BenchmarkResult[];
  memoryManager: BenchmarkResult[];
}

/**
 * Options for benchmark suite
 */
export interface BenchmarkSuiteOptions {
  /** Name of the benchmark suite */
  name: string;
  /** Description of the benchmark suite */
  description?: string;
  /** Whether to run benchmarks in sequence or parallel */
  parallel?: boolean;
  /** Base options for all benchmarks in the suite */
  baseOptions?: Partial<BenchmarkOptions>;
}

/**
 * Represents a single benchmark
 */
export class Benchmark {
  private name: string;
  private description?: string;
  private iterations: number;
  private warmup: number;
  private timeBudget?: number;
  private collectMemoryStats: boolean;
  private collectCpuStats: boolean;
  private optimize: boolean;
  private usePerformanceTrace: boolean;
  private fn: () => any;

  /**
   * Create a new benchmark
   * @param fn Function to benchmark
   * @param options Benchmark options
   */
  constructor(fn: () => any, options: BenchmarkOptions) {
    this.fn = fn;
    this.name = options.name;
    this.description = options.description;
    this.iterations = options.iterations || 1000;
    this.warmup = options.warmup || 10;
    this.timeBudget = options.timeBudget;
    this.collectMemoryStats = options.collectMemoryStats || false;
    this.collectCpuStats = options.collectCpuStats || false;
    this.optimize = options.optimize || false;
    this.usePerformanceTrace = options.usePerformanceTrace || false;

    if (this.optimize) {
      this.fn = v8Optimizer.optimizeFunction(this.fn);
    }
  }

  /**
   * Run the benchmark
   * @returns Benchmark results
   */
  async run(): Promise<BenchmarkResult> {
    console.log(`Running benchmark: ${this.name}`);

    // Record starting memory if needed
    let startMemory: NodeJS.MemoryUsage | undefined;
    if (this.collectMemoryStats) {
      startMemory = process.memoryUsage();
    }

    // Record starting CPU usage if needed
    let startCpu: NodeJS.CpuUsage | undefined;
    if (this.collectCpuStats) {
      startCpu = process.cpuUsage();
    }

    // Setup performance trace if enabled
    let observer: PerformanceObserver | undefined;
    if (this.usePerformanceTrace) {
      observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          console.log(`Trace: ${entry.name}: ${entry.duration}ms`);
        });
      });
      observer.observe({ entryTypes: ['measure'] });
    }

    // Warmup phase
    console.log(`Warming up for ${this.warmup} iterations...`);
    for (let i = 0; i < this.warmup; i++) {
      await this.fn();
    }

    // Measure phase
    console.log(`Running ${this.iterations} iterations...`);
    const times: number[] = [];
    const startTime = performance.now();
    let iteration = 0;

    if (this.timeBudget) {
      // If we have a time budget, run until we hit it
      const endTime = startTime + this.timeBudget;

      while (performance.now() < endTime && iteration < this.iterations) {
        const iterStart = performance.now();
        await this.fn();
        times.push(performance.now() - iterStart);
        iteration++;
      }
    } else {
      // Otherwise run for fixed number of iterations
      for (let i = 0; i < this.iterations; i++) {
        const iterStart = performance.now();
        await this.fn();
        times.push(performance.now() - iterStart);
        iteration++;
      }
    }

    const totalTime = performance.now() - startTime;

    // Calculate statistics
    times.sort((a, b) => a - b);
    const actualIterations = times.length;
    const avgTime = totalTime / actualIterations;
    const opsPerSecond = Math.round(1000 / avgTime);

    // Calculate standard deviation
    const sumDiffSquared = times.reduce((sum, time) => {
      const diff = time - avgTime;
      return sum + diff * diff;
    }, 0);
    const stdDev = Math.sqrt(sumDiffSquared / actualIterations);

    // Calculate margin of error (95% confidence)
    const marginOfError = 1.96 * (stdDev / Math.sqrt(actualIterations));

    // Calculate percentiles
    const p50 = this.percentile(times, 0.5);
    const p90 = this.percentile(times, 0.9);
    const p95 = this.percentile(times, 0.95);
    const p99 = this.percentile(times, 0.99);

    // End performance tracing
    if (observer) {
      observer.disconnect();
    }

    // Record final memory and CPU usage
    let memoryStats;
    if (this.collectMemoryStats && startMemory) {
      const endMemory = process.memoryUsage();
      memoryStats = {
        before: startMemory,
        after: endMemory,
        diff: {
          rss: endMemory.rss - startMemory.rss,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external,
          arrayBuffers:
            endMemory.arrayBuffers && startMemory.arrayBuffers
              ? endMemory.arrayBuffers - startMemory.arrayBuffers
              : undefined
        }
      };
    }

    let cpuStats;
    if (this.collectCpuStats && startCpu) {
      const endCpu = process.cpuUsage(startCpu);
      cpuStats = {
        user: endCpu.user / 1000, // Convert to ms
        system: endCpu.system / 1000 // Convert to ms
      };
    }

    // Create result object using the updated interface
    const result: BenchmarkResult = {
      name: this.name,
      operationsPerSecond: opsPerSecond,
      averageTime: avgTime,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      totalTime,
      iterations: actualIterations,
      memoryUsed: memoryStats ? memoryStats.diff.heapUsed : 0,
      usedSIMD: false, // Default value
      cpuUtilization: cpuStats ? cpuStats.user + cpuStats.system : 0
    };

    console.log(`Completed benchmark: ${this.name}`);
    console.log(`  Average time: ${avgTime.toFixed(4)}ms`);
    console.log(`  Operations/second: ${opsPerSecond.toLocaleString()}`);

    return result;
  }

  /**
   * Calculate a percentile value from an array of numbers
   * @param values Sorted array of values
   * @param percentile Percentile to calculate (0-1)
   * @returns The percentile value
   */
  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const index = Math.max(0, Math.min(Math.floor(percentile * values.length), values.length - 1));

    return values[index]!;
  }
}

/**
 * A suite of benchmarks to run together
 */
export class BenchmarkSuite {
  private name: string;
  private description?: string;
  private parallel: boolean;
  private baseOptions: Partial<BenchmarkOptions>;
  private benchmarks: Benchmark[] = [];

  /**
   * Create a new benchmark suite
   * @param options Suite options
   */
  constructor(options: BenchmarkSuiteOptions) {
    this.name = options.name;
    this.description = options.description;
    this.parallel = options.parallel || false;
    this.baseOptions = options.baseOptions || {};
  }

  /**
   * Add a benchmark to the suite
   * @param fn Function to benchmark
   * @param options Benchmark options
   * @returns This suite for chaining
   */
  add(fn: () => any, options: Partial<BenchmarkOptions>): BenchmarkSuite {
    const fullOptions: BenchmarkOptions = {
      ...this.baseOptions,
      ...options,
      name: options.name || `Benchmark ${this.benchmarks.length + 1}`
    } as BenchmarkOptions;

    this.benchmarks.push(new Benchmark(fn, fullOptions));
    return this;
  }

  /**
   * Run all benchmarks in the suite
   * @returns Results for all benchmarks
   */
  async run(): Promise<BenchmarkResult[]> {
    console.log(`Running benchmark suite: ${this.name}`);
    console.log(`Total benchmarks: ${this.benchmarks.length}`);

    let results: BenchmarkResult[] = [];

    if (this.parallel) {
      // Run benchmarks in parallel
      results = await Promise.all(this.benchmarks.map(benchmark => benchmark.run()));
    } else {
      // Run benchmarks sequentially
      for (const benchmark of this.benchmarks) {
        results.push(await benchmark.run());
      }
    }

    console.log(`Completed benchmark suite: ${this.name}`);
    return results;
  }

  /**
   * Compare the results of two benchmarks
   * @param benchmark1Name Name of first benchmark
   * @param benchmark2Name Name of second benchmark
   * @param results Results to compare
   * @returns Comparison as a string
   */
  compareResults(
    benchmark1Name: string,
    benchmark2Name: string,
    results: BenchmarkResult[]
  ): string {
    const result1 = results.find(r => r.name === benchmark1Name);
    const result2 = results.find(r => r.name === benchmark2Name);

    if (!result1 || !result2) {
      return 'Cannot compare: one or both benchmarks not found';
    }

    const timeRatio = result2.averageTime / result1.averageTime;
    const opsRatio = result1.operationsPerSecond / result2.operationsPerSecond;

    let output = `Comparison: ${benchmark1Name} vs ${benchmark2Name}\n`;
    output += `  Time ratio: ${timeRatio.toFixed(2)}x`;
    output += ` (${result1.name} is ${timeRatio > 1 ? 'faster' : 'slower'})\n`;
    output += `  Ops/sec ratio: ${opsRatio.toFixed(2)}x`;
    output += ` (${result1.name} performs ${opsRatio > 1 ? 'more' : 'fewer'} operations per second)\n`;

    if (result1.memoryUsed && result2.memoryUsed) {
      const heapRatio = result2.memoryUsed / result1.memoryUsed;
      output += `  Memory usage ratio: ${heapRatio.toFixed(2)}x`;
      output += ` (${result1.name} uses ${heapRatio > 1 ? 'less' : 'more'} memory)\n`;
    }

    return output;
  }

  /**
   * Save benchmark results to a file
   * @param results Results to save
   * @param filePath Path to save to (defaults to results directory)
   */
  saveResults(results: BenchmarkResult[], filePath?: string): void {
    // Create default path if not provided
    if (!filePath) {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const defaultPath = path.join(process.cwd(), 'benchmark-results');

      // Ensure directory exists
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }

      filePath = path.join(defaultPath, `${this.name}-${timestamp}.json`);
    }

    // Create result object with metadata
    const resultData = {
      suite: {
        name: this.name,
        description: this.description,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      results
    };

    // Write to file
    fs.writeFileSync(filePath, JSON.stringify(resultData, null, 2));
    console.log(`Benchmark results saved to: ${filePath}`);
  }
}

/**
 * Performance trace decorator for methods
 * @param target Target object
 * @param propertyKey Method name
 * @param descriptor Method descriptor
 * @returns Modified descriptor
 */
export function trace(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]): any {
    const className = target.constructor.name;
    const methodName = propertyKey;
    const label = `${className}.${methodName}`;

    performance.mark(`${label}-start`);
    const result = originalMethod.apply(this, args);

    // Handle both synchronous and asynchronous methods
    if (result instanceof Promise) {
      return result.finally(() => {
        performance.mark(`${label}-end`);
        performance.measure(label, `${label}-start`, `${label}-end`);
      });
    }

    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    return result;
  };

  return descriptor;
}

// V8 optimizer utility
const v8Optimizer = {
  /**
   * Optimize a function for V8 engine
   * @param fn Function to optimize
   * @returns Optimized function
   */
  optimizeFunction<T extends Function>(fn: T): T {
    // This is a stub implementation
    // In a real implementation, we would use V8 intrinsics or flags
    // For now, we just return the original function
    return fn;
  }
};

export class PerformanceBenchmark {
  private results: Map<string, BenchmarkResult[]> = new Map();
  private nativeModules: any = {};

  constructor() {
    this.loadNativeModules();
  }

  private loadNativeModules() {
    try {
      // Load native modules with error handling
      this.nativeModules.simdOptimizer = require('../native').SIMDOptimizer;
      this.nativeModules.jsonProcessor = require('../native').JsonProcessor;
      this.nativeModules.compressionEngine = require('../native').CompressionEngine;
      this.nativeModules.httpParser = require('../native').HTTPParser;
      this.nativeModules.memoryManager = require('../native').MemoryManager;
    } catch (error) {
      console.warn('Some native modules could not be loaded:', error.message);
    }
  }

  // Comprehensive SIMD benchmarks
  async benchmarkSIMDOptimizer(): Promise<SIMDBenchmarkResult[]> {
    const results: SIMDBenchmarkResult[] = [];

    if (!this.nativeModules.simdOptimizer) {
      console.warn('SIMD Optimizer not available');
      return results;
    }

    const simdOpt = new this.nativeModules.simdOptimizer();

    // Test different array sizes and types
    const testSizes = [1000, 10000, 100000, 1000000];
    const operations = [
      'arraySumFloat32',
      'arraySumFloat64',
      'arraySumInt32',
      'arrayMultiply',
      'arrayMultiplyFloat64',
      'arrayDotProduct',
      'arrayConvolve',
      'fastMemcpy',
      'fastMemset',
      'stringSearch'
    ];

    for (const operation of operations) {
      for (const size of testSizes) {
        const testData = this.generateTestData(operation, size);

        // Benchmark with SIMD
        const simdResult = await this.benchmarkFunction(
          `${operation}_SIMD_${size}`,
          () => this.callSIMDOperation(simdOpt, operation, testData),
          { iterations: operation.includes('Mem') ? 100 : 1000 }
        );

        // Benchmark scalar version (if available)
        const scalarResult = await this.benchmarkScalarVersion(operation, testData);

        const simdBenchmark: SIMDBenchmarkResult = {
          ...simdResult,
          simdSpeedup: scalarResult ? scalarResult.averageTime / simdResult.averageTime : 1,
          vectorizationEfficiency: this.calculateVectorizationEfficiency(simdResult),
          cacheHitRate: this.estimateCacheHitRate(size)
        };

        results.push(simdBenchmark);
      }
    }

    return results;
  }

  // Benchmark JSON processing with SIMD optimizations
  async benchmarkJSONProcessor(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    if (!this.nativeModules.jsonProcessor) {
      console.warn('JSON Processor not available');
      return results;
    }

    const jsonProcessor = new this.nativeModules.jsonProcessor();

    // Test different JSON scenarios
    const testCases = [
      { name: 'small_object', data: this.generateSmallJSON() },
      { name: 'large_object', data: this.generateLargeJSON() },
      { name: 'array_numbers', data: this.generateNumberArray(10000) },
      { name: 'nested_objects', data: this.generateNestedJSON(5, 100) },
      { name: 'mixed_content', data: this.generateMixedJSON() }
    ];

    for (const testCase of testCases) {
      // Parse benchmark
      const parseResult = await this.benchmarkFunction(
        `json_parse_${testCase.name}`,
        () => jsonProcessor.parse(testCase.data),
        { iterations: 1000 }
      );

      // Stringify benchmark
      const parsedData = JSON.parse(testCase.data);
      const stringifyResult = await this.benchmarkFunction(
        `json_stringify_${testCase.name}`,
        () => jsonProcessor.stringify(parsedData),
        { iterations: 1000 }
      );

      results.push(parseResult, stringifyResult);
    }

    return results;
  }

  // Benchmark compression engine with SIMD optimizations
  async benchmarkCompressionEngine(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    if (!this.nativeModules.compressionEngine) {
      console.warn('Compression Engine not available');
      return results;
    }

    const compressionEngine = new this.nativeModules.compressionEngine();

    // Test different data types and sizes
    const testData = [
      { name: 'text_repetitive', data: this.generateRepetitiveText(50000) },
      { name: 'text_random', data: this.generateRandomText(50000) },
      { name: 'binary_structured', data: this.generateStructuredBinary(50000) },
      { name: 'binary_random', data: this.generateRandomBinary(50000) },
      { name: 'json_large', data: Buffer.from(this.generateLargeJSON()) }
    ];

    const algorithms = ['LZ77', 'RLE', 'Delta'];

    for (const test of testData) {
      for (const algorithm of algorithms) {
        // Compression benchmark
        const compressResult = await this.benchmarkFunction(
          `compress_${algorithm}_${test.name}`,
          () => compressionEngine[`compress${algorithm}`](test.data),
          { iterations: 100 }
        );

        compressResult.throughputMBps = (test.data.length / (1024 * 1024)) / (compressResult.averageTime / 1000);
        results.push(compressResult);
      }
    }

    return results;
  }

  // Benchmark HTTP parser with SIMD optimizations
  async benchmarkHTTPParser(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    if (!this.nativeModules.httpParser) {
      console.warn('HTTP Parser not available');
      return results;
    }

    const httpParser = new this.nativeModules.httpParser();

    const testRequests = [
      this.generateSimpleHTTPRequest(),
      this.generateComplexHTTPRequest(),
      this.generateLargeHeadersRequest(),
      this.generateJSONPostRequest(),
      this.generateMultipartRequest()
    ];

    for (let i = 0; i < testRequests.length; i++) {
      const request = testRequests[i];
      const result = await this.benchmarkFunction(
        `http_parse_request_${i}`,
        () => httpParser.parseRequest(request),
        { iterations: 10000 }
      );

      result.throughputMBps = (request.length / (1024 * 1024)) / (result.averageTime / 1000);
      results.push(result);
    }

    return results;
  }

  // Benchmark memory manager
  async benchmarkMemoryManager(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    if (!this.nativeModules.memoryManager) {
      console.warn('Memory Manager not available');
      return results;
    }

    const memoryManager = new this.nativeModules.memoryManager();

    const sizes = [64, 256, 1024, 4096, 16384];

    for (const size of sizes) {
      // Allocation benchmark
      const allocResult = await this.benchmarkFunction(
        `memory_alloc_${size}`,
        () => memoryManager.allocate(size),
        { iterations: 10000 }
      );

      // Pool hit rate benchmark
      const poolResult = await this.benchmarkFunction(
        `memory_pool_${size}`,
        () => {
          const ptr = memoryManager.allocate(size);
          memoryManager.deallocate(ptr);
          return memoryManager.allocate(size);
        },
        { iterations: 10000 }
      );

      results.push(allocResult, poolResult);
    }

    return results;
  }

  // Core benchmarking function with enhanced metrics
  async benchmarkFunction(
    name: string,
    fn: Function,
    options: { iterations?: number; warmup?: number; timeout?: number } = {}
  ): Promise<BenchmarkResult> {
    const { iterations = 1000, warmup = 100, timeout = 30000 } = options;

    const times: number[] = [];
    const memoryUsages: number[] = [];
    let usedSIMD = false;

    // Warmup
    for (let i = 0; i < warmup; i++) {
      try {
        await fn();
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Clear memory and force GC
    if (global.gc) {
      global.gc();
    }

    const startMemory = process.memoryUsage().heapUsed;
    const startCPU = process.cpuUsage();
    const startTime = performance.now();

    // Main benchmark loop
    for (let i = 0; i < iterations; i++) {
      const iterationStart = performance.now();

      try {
        const result = await fn();

        // Check if result indicates SIMD usage
        if (result && typeof result === 'object' && result.usedSIMD) {
          usedSIMD = true;
        }
      } catch (error) {
        console.warn(`Error in benchmark ${name}, iteration ${i}:`, error.message);
        continue;
      }

      const iterationEnd = performance.now();
      times.push(iterationEnd - iterationStart);

      // Sample memory usage periodically
      if (i % 100 === 0) {
        memoryUsages.push(process.memoryUsage().heapUsed);
      }

      // Timeout check
      if (performance.now() - startTime > timeout) {
        console.warn(`Benchmark ${name} timed out after ${i + 1} iterations`);
        break;
      }
    }

    const endCPU = process.cpuUsage(startCPU);
    const endMemory = process.memoryUsage().heapUsed;

    // Calculate statistics
    const validTimes = times.filter(t => !isNaN(t) && t > 0);
    const averageTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const minTime = Math.min(...validTimes);
    const maxTime = Math.max(...validTimes);
    const totalTime = validTimes.reduce((a, b) => a + b, 0);
    const operationsPerSecond = 1000 / averageTime;
    const memoryUsed = Math.max(0, endMemory - startMemory);
    const cpuUtilization = (endCPU.user + endCPU.system) / 1000; // Convert to milliseconds

    const result: BenchmarkResult = {
      name,
      operationsPerSecond,
      averageTime,
      minTime,
      maxTime,
      totalTime,
      iterations: validTimes.length,
      memoryUsed,
      usedSIMD,
      cpuUtilization
    };

    // Store result
    if (!this.results.has(name)) {
      this.results.set(name, []);
    }
    this.results.get(name)!.push(result);

    return result;
  }

  // Run comprehensive benchmark suite
  async runComprehensiveBenchmarks(): Promise<NativeModuleBenchmarks> {
    console.log('Starting comprehensive native module benchmarks...');

    const results: NativeModuleBenchmarks = {
      simdOptimizer: [],
      jsonProcessor: [],
      compressionEngine: [],
      httpParser: [],
      memoryManager: []
    };

    try {
      console.log('Benchmarking SIMD Optimizer...');
      results.simdOptimizer = await this.benchmarkSIMDOptimizer();

      console.log('Benchmarking JSON Processor...');
      results.jsonProcessor = await this.benchmarkJSONProcessor();

      console.log('Benchmarking Compression Engine...');
      results.compressionEngine = await this.benchmarkCompressionEngine();

      console.log('Benchmarking HTTP Parser...');
      results.httpParser = await this.benchmarkHTTPParser();

      console.log('Benchmarking Memory Manager...');
      results.memoryManager = await this.benchmarkMemoryManager();

    } catch (error) {
      console.error('Error during benchmarking:', error);
    }

    return results;
  }

  // Generate comprehensive benchmark report
  generateReport(results: NativeModuleBenchmarks): string {
    let report = '# NexureJS Native Modules Performance Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Platform: ${process.platform} ${process.arch}\n`;
    report += `Node.js: ${process.version}\n`;
    report += `CPU Cores: ${cpus().length}\n\n`;

    // SIMD Optimizer Report
    if (results.simdOptimizer.length > 0) {
      report += '## SIMD Optimizer Performance\n\n';
      report += '| Operation | Size | Ops/sec | Avg Time (ms) | SIMD Speedup | Vectorization Efficiency |\n';
      report += '|-----------|------|---------|---------------|--------------|---------------------------|\n';

      for (const result of results.simdOptimizer) {
        report += `| ${result.name} | - | ${result.operationsPerSecond.toFixed(0)} | ${result.averageTime.toFixed(3)} | ${result.simdSpeedup.toFixed(2)}x | ${(result.vectorizationEfficiency * 100).toFixed(1)}% |\n`;
      }
      report += '\n';
    }

    // JSON Processor Report
    if (results.jsonProcessor.length > 0) {
      report += '## JSON Processor Performance\n\n';
      report += '| Operation | Ops/sec | Avg Time (ms) | Memory Used (KB) |\n';
      report += '|-----------|---------|---------------|------------------|\n';

      for (const result of results.jsonProcessor) {
        report += `| ${result.name} | ${result.operationsPerSecond.toFixed(0)} | ${result.averageTime.toFixed(3)} | ${(result.memoryUsed / 1024).toFixed(1)} |\n`;
      }
      report += '\n';
    }

    // Add similar sections for other modules...

    return report;
  }

  // Save benchmark results to file
  async saveBenchmarkResults(results: NativeModuleBenchmarks, filename?: string): Promise<void> {
    const outputFile = filename || `benchmark-results-${Date.now()}.json`;
    const outputPath = path.join(process.cwd(), 'benchmarks', outputFile);

    // Ensure benchmarks directory exists
    const benchmarksDir = path.dirname(outputPath);
    if (!fs.existsSync(benchmarksDir)) {
      fs.mkdirSync(benchmarksDir, { recursive: true });
    }

    const data = {
      timestamp: new Date().toISOString(),
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version,
        cpus: cpus().length
      },
      results
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Benchmark results saved to: ${outputPath}`);
  }

  // Helper methods for generating test data
  private generateTestData(operation: string, size: number): any {
    switch (operation) {
      case 'arraySumFloat32':
      case 'arrayMultiply':
        return new Float32Array(size).fill(0).map(() => Math.random());

      case 'arraySumFloat64':
      case 'arrayMultiplyFloat64':
        return new Float64Array(size).fill(0).map(() => Math.random());

      case 'arraySumInt32':
        return new Int32Array(size).fill(0).map(() => Math.floor(Math.random() * 1000));

      case 'arrayDotProduct':
        return [
          new Float32Array(size).fill(0).map(() => Math.random()),
          new Float32Array(size).fill(0).map(() => Math.random())
        ];

      case 'arrayConvolve':
        return [
          new Float32Array(size).fill(0).map(() => Math.random()),
          new Float32Array(8).fill(0).map(() => Math.random()) // Kernel
        ];

      case 'fastMemcpy':
      case 'fastMemset':
        return Buffer.alloc(size);

      case 'stringSearch':
        const haystack = 'a'.repeat(size);
        return [haystack, 'aa'];

      default:
        return Buffer.alloc(size);
    }
  }

  private callSIMDOperation(simdOpt: any, operation: string, testData: any): any {
    switch (operation) {
      case 'arraySumFloat32':
        return simdOpt.arraySumFloat32(testData);
      case 'arraySumFloat64':
        return simdOpt.arraySumFloat64(testData);
      case 'arraySumInt32':
        return simdOpt.arraySumInt32(testData);
      case 'arrayMultiply':
        return simdOpt.arrayMultiply(testData, testData);
      case 'arrayMultiplyFloat64':
        return simdOpt.arrayMultiplyFloat64(testData, testData);
      case 'arrayDotProduct':
        return simdOpt.arrayDotProduct(testData[0], testData[1]);
      case 'arrayConvolve':
        return simdOpt.arrayConvolve(testData[0], testData[1]);
      case 'fastMemcpy':
        return simdOpt.fastMemcpy(testData);
      case 'fastMemset':
        return simdOpt.fastMemset(testData, 0x42);
      case 'stringSearch':
        return simdOpt.stringSearch(testData[0], testData[1]);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // Additional helper methods...
  private async benchmarkScalarVersion(operation: string, testData: any): Promise<BenchmarkResult | null> {
    // Implement scalar versions for comparison
    // This would require implementing JavaScript equivalents
    return null;
  }

  private calculateVectorizationEfficiency(result: BenchmarkResult): number {
    // Estimate vectorization efficiency based on performance characteristics
    return Math.min(1.0, result.operationsPerSecond / 1000000);
  }

  private estimateCacheHitRate(dataSize: number): number {
    // Rough estimate based on data size and typical cache sizes
    if (dataSize < 32 * 1024) return 0.95;      // L1 cache
    if (dataSize < 256 * 1024) return 0.85;     // L2 cache
    if (dataSize < 8 * 1024 * 1024) return 0.7; // L3 cache
    return 0.5; // Main memory
  }

  // Test data generators
  private generateSmallJSON(): string {
    return JSON.stringify({ id: 1, name: 'test', active: true });
  }

  private generateLargeJSON(): string {
    const obj: any = { items: [] };
    for (let i = 0; i < 1000; i++) {
      obj.items.push({
        id: i,
        name: `item_${i}`,
        value: Math.random(),
        tags: [`tag_${i % 10}`, `category_${i % 5}`],
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          version: 1
        }
      });
    }
    return JSON.stringify(obj);
  }

  private generateNumberArray(size: number): string {
    const arr = Array.from({ length: size }, () => Math.random());
    return JSON.stringify(arr);
  }

  private generateNestedJSON(depth: number, width: number): string {
    const generate = (currentDepth: number): any => {
      if (currentDepth === 0) {
        return Math.random();
      }

      const obj: any = {};
      for (let i = 0; i < width; i++) {
        obj[`key_${i}`] = generate(currentDepth - 1);
      }
      return obj;
    };

    return JSON.stringify(generate(depth));
  }

  private generateMixedJSON(): string {
    return JSON.stringify({
      string: 'hello world',
      number: 42,
      float: 3.14159,
      boolean: true,
      null: null,
      array: [1, 2, 3, 'four', true],
      object: { nested: { deep: { value: 'found' } } },
      longString: 'a'.repeat(1000)
    });
  }

  private generateRepetitiveText(size: number): Buffer {
    return Buffer.from('Hello World! '.repeat(Math.ceil(size / 13)).substring(0, size));
  }

  private generateRandomText(size: number): Buffer {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
    let result = '';
    for (let i = 0; i < size; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return Buffer.from(result);
  }

  private generateStructuredBinary(size: number): Buffer {
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i += 4) {
      buffer.writeUInt32LE(i, i);
    }
    return buffer;
  }

  private generateRandomBinary(size: number): Buffer {
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  }

  private generateSimpleHTTPRequest(): string {
    return 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n';
  }

  private generateComplexHTTPRequest(): string {
    return `POST /api/data HTTP/1.1\r
Host: api.example.com\r
User-Agent: Mozilla/5.0 (compatible; NexureJS/1.0)\r
Accept: application/json\r
Content-Type: application/json\r
Content-Length: 25\r
Authorization: Bearer token123\r
\r
{"key": "value", "id": 1}`;
  }

  private generateLargeHeadersRequest(): string {
    let request = 'GET /large-headers HTTP/1.1\r\nHost: example.com\r\n';
    for (let i = 0; i < 50; i++) {
      request += `X-Custom-Header-${i}: ${'value'.repeat(20)}\r\n`;
    }
    request += '\r\n';
    return request;
  }

  private generateJSONPostRequest(): string {
    const data = JSON.stringify({ data: 'a'.repeat(1000) });
    return `POST /json HTTP/1.1\r
Host: example.com\r
Content-Type: application/json\r
Content-Length: ${data.length}\r
\r
${data}`;
  }

  private generateMultipartRequest(): string {
    const boundary = 'boundary123';
    const body = `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="test.txt"\r
Content-Type: text/plain\r
\r
${'test data '.repeat(100)}\r
--${boundary}--\r\n`;

    return `POST /upload HTTP/1.1\r
Host: example.com\r
Content-Type: multipart/form-data; boundary=${boundary}\r
Content-Length: ${body.length}\r
\r
${body}`;
  }
}

// Export convenience function
export async function runBenchmarks(): Promise<NativeModuleBenchmarks> {
  const benchmark = new PerformanceBenchmark();
  return await benchmark.runComprehensiveBenchmarks();
}

// CLI interface
if (require.main === module) {
  (async () => {
    const benchmark = new PerformanceBenchmark();
    const results = await benchmark.runComprehensiveBenchmarks();

    console.log(`\n${  benchmark.generateReport(results)}`);
    await benchmark.saveBenchmarkResults(results);

    console.log('\nBenchmarks completed successfully!');
  })().catch(console.error);
}
