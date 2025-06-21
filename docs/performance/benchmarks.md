# NexureJS Performance Benchmarks

This document describes the benchmarking capabilities of NexureJS and how to use them to measure and improve performance.

## Overview

NexureJS includes a comprehensive benchmarking system to measure the performance of various aspects of the library. This helps with:

- Identifying performance bottlenecks
- Comparing different implementations (native vs JavaScript)
- Tracking performance improvements over time
- Making data-driven decisions for optimization

## Benchmark Framework

The benchmarks are located in the `benchmarks/` directory:

- `benchmarks.ts` - Consolidated benchmark file containing all benchmark tests

## Running Benchmarks

You can run the benchmarks using the following command:

```bash
npm run benchmark
```

This will execute multiple benchmark categories and measure their performance metrics, including:

- Basic JavaScript operations (array, object, string manipulations)
- HTTP request parsing (native vs JavaScript implementation)
- Router performance
- JSON parsing and serialization
- URL parsing
- Schema validation
- WebSocket operations
- Compression algorithms

The benchmark results will be saved to the `benchmark-results` directory as JSON files with timestamps.

## Benchmark Categories

The benchmark system includes the following categories:

### Basic Benchmarks

Tests fundamental JavaScript operations:

- Array operations (map, filter, reduce, forEach, spread)
- Object operations (keys, values, entries, spread)
- String operations (concat, template literals, split, replace)

### HTTP Benchmarks

Tests HTTP-related functionality:

- Request parsing (headers, body, query parameters)
- Headers parsing optimization
- Body parsing for different content types

### Router Benchmarks

Tests the performance of the routing system:

- Route matching
- Parameter extraction
- Middleware execution

### JSON Benchmarks

Tests JSON handling performance:

- Parsing (native vs optimized)
- Serialization
- Schema validation during parsing

### URL Benchmarks

Tests URL handling:

- URL parsing
- Query parameter extraction
- Path normalization

### Schema Validation Benchmarks

Tests schema validation performance:

- Object validation
- Array validation
- Nested schema validation

### WebSocket Benchmarks

Tests WebSocket operations:

- Frame parsing
- Message handling
- Connection management

### Compression Benchmarks

Tests compression algorithms:

- Gzip compression/decompression
- Deflate compression/decompression
- Brotli compression/decompression

## Benchmark Dashboard

NexureJS includes a visual dashboard for analyzing benchmark results. To open the dashboard:

```bash
npm run benchmark:dashboard
```

This will open the benchmark dashboard in your default web browser. The dashboard provides:

- Visual comparison of different implementation types (native vs JS)
- Performance trends over time
- Detailed metrics for each benchmark run
- Category-based filtering and comparison

### Using the Dashboard

1. Run benchmarks to generate result files:
   ```bash
   npm run benchmark
   ```

2. Open the dashboard:
   ```bash
   npm run benchmark:dashboard
   ```

3. In the dashboard, click "Browse" and select one or more JSON files from the `benchmark-results` directory

4. Click "Load Results" to visualize the data

5. Use the category filters to focus on specific benchmark types

## Comparing Native vs JavaScript Implementations

Many benchmarks include comparison between native (compiled C/C++) and pure JavaScript implementations:

```typescript
// Native implementation benchmark
const nativeResult = runBenchmark('HTTP Parser (Native)', 'http', () => {
  const parser = new NativeHttpParser();
  parser.parse(sampleRequest);
});

// JavaScript implementation benchmark
const jsResult = runBenchmark('HTTP Parser (JS)', 'http', () => {
  const parser = new JsHttpParser();
  parser.parse(sampleRequest);
});

// Compare results and show improvement percentage
compareResults(nativeResult, jsResult);
```

This helps quantify the performance benefits of native implementations and guides optimization efforts.

## Interpreting Results

The benchmark results include the following metrics:

- **Name**: Benchmark name
- **Category**: Benchmark category
- **Operations Per Second**: How many operations can be performed per second
- **Duration**: Total time taken for all iterations (milliseconds)
- **Iterations**: Number of times the benchmark was run
- **Improvement**: Percentage improvement over the comparison benchmark (when applicable)

Higher "Operations Per Second" values indicate better performance.

## Performance Tips

Based on benchmark results, consider the following tips to optimize your NexureJS applications:

1. **Use native modules when available**: Native implementations can be significantly faster for CPU-intensive operations

2. **Choose the right parser for your use case**:
   - For high-throughput HTTP servers, use the native HTTP parser
   - For simpler use cases, the JavaScript parser may be sufficient

3. **Optimize JSON handling**:
   - Use schema validation only when necessary
   - Consider streaming for large JSON documents

4. **Router optimization**:
   - Put most frequently accessed routes first
   - Minimize middleware usage on critical paths

5. **Choose the right compression algorithm**:
   - Brotli for static assets (best compression)
   - Gzip for dynamic content (balance of speed and compression)
   - No compression for small responses or already compressed data

## Adding Custom Benchmarks

You can extend the benchmark system to test your own code:

1. Open `benchmarks/benchmarks.ts`
2. Add a new benchmark function following the existing patterns
3. Include your benchmark function in the `runAllBenchmarks` function

Example:

```typescript
function benchmarkMyFeature(): void {
  console.log('\n=== My Feature ===');

  runBenchmark('My Feature Implementation A', 'custom', () => {
    // Code to benchmark
    implementationA();
  });

  runBenchmark('My Feature Implementation B', 'custom', () => {
    // Alternative implementation
    implementationB();
  });
}

// Add to the main benchmark function
async function runAllBenchmarks(): Promise<void> {
  // ... existing benchmarks
  benchmarkMyFeature();
  // ... more benchmarks
}
```

## CI Integration

The benchmarking system is integrated with CI/CD workflows to track performance over time:

```bash
# Run as part of CI testing
npm run ci:benchmark
```

This ensures that performance regressions are caught early before they reach production.
