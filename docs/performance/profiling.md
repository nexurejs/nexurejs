# NexureJS Profiling Guide

This document describes the profiling capabilities of NexureJS and how to use them to identify performance bottlenecks and optimize your applications.

## Overview

NexureJS includes a comprehensive profiling system with tools for:

- CPU profiling
- Memory profiling
- Stream processing profiling
- Performance benchmarking

These tools help you identify and resolve performance issues in your applications.

## Profiling Tools

The profiling tools are located in the `profiling/` directory:

- `profiler.js` - Main profiling tool that includes CPU and memory profiling
- `data-generators.js` - Generates test data for profiling
- `run.js` - CLI tool to run profiling scenarios

## Running Profilers

You can run the profilers using the following commands:

```bash
# Run all profiling tests
node profiling/run.js

# Run specific profiling tests
node profiling/run.js --cpu      # CPU profiling only
node profiling/run.js --memory   # Memory profiling only
node profiling/run.js --stream   # Stream processing profiling only
```

## CPU Profiling

The CPU profiler captures detailed performance information about your code execution:

```javascript
import { CpuProfiler } from '../profiling/profiler.js';

// Create a profiler instance
const profiler = new CpuProfiler({
  name: 'my-feature-test'
}).initialize();

// Start profiling
profiler.start();

// Run your code
myFeatureToProfile();

// Stop profiling and save results
await profiler.stop();
```

### Analyzing CPU Profiles

CPU profiles are saved as `.cpuprofile` files in the `benchmarks/profiling-results/cpu-profiles` directory. You can analyze these files using:

1. Chrome DevTools - Open Chrome, press F12, go to the Performance tab, and load the `.cpuprofile` file
2. VS Code - Install the "JavaScript Profile Viewer" extension and open the `.cpuprofile` file

## Memory Profiling

The memory profiler tracks memory usage and helps identify memory leaks:

```javascript
import { MemoryProfiler } from '../profiling/profiler.js';

// Create a memory profiler
const memProfiler = new MemoryProfiler({
  name: 'memory-test'
});

// Start memory tracking
memProfiler.start();

// Mark important points
memProfiler.markStart('feature-x');
// Run code that might have memory issues
featureX();
memProfiler.markEnd('feature-x');

// Stop profiling and save results
const results = memProfiler.stop({
  additionalInfo: 'Testing memory usage of Feature X'
});
```

Memory profiles are saved as JSON files in the `benchmarks/profiling-results/memory-profiles` directory.

## Stream Processing Profiling

The stream profiling tools help analyze and optimize stream-based data processing:

```javascript
import {
  testSmallJsonInMemory,
  testLargeJsonStreaming
} from '../profiling/profiler.js';

// Compare in-memory vs streaming performance
await testSmallJsonInMemory();
await testLargeJsonStreaming();
```

## Test Data Generation

The `data-generators.js` module provides functions to generate test data for profiling:

```javascript
import {
  generateTextData,
  generateJsonData,
  generateCsvData,
  generateNestedObject
} from '../profiling/data-generators.js';

// Generate 1MB of text data
const textData = generateTextData(1024 * 1024);

// Generate a complex JSON document with 1000 items
const jsonData = generateJsonData(1000);
```

## Profiling Dashboard

To visualize profiling results, run:

```bash
npm run profile:dashboard
```

This opens a web-based dashboard showing:
- CPU usage over time
- Memory allocation patterns
- Potential bottlenecks
- Performance comparisons

## Best Practices

1. **Targeted Profiling**: Focus on specific parts of your code rather than profiling everything at once
2. **Baseline Comparisons**: Always create a baseline profile before making optimizations
3. **Realistic Data**: Use realistic data sets that match your production environment
4. **Isolated Tests**: Profile in isolation to avoid interference from other processes
5. **Regular Profiling**: Make profiling part of your development workflow to catch regressions early

## Interpreting Results

When analyzing profiling results, look for:

- Functions with high execution time
- Excessive memory allocations
- Memory that grows without being released
- Inefficient stream processing patterns
- Functions called more frequently than expected

## Automation

Include profiling in your CI/CD pipeline to automatically detect performance regressions:

```bash
# Run as part of CI testing
npm run ci:profile
```

This will run key profiling scenarios and fail the build if performance drops below defined thresholds.
