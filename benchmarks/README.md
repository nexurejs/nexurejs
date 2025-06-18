# Nexure.js Benchmarks

This directory contains benchmark tools for measuring and comparing the performance of Nexure.js native modules.

## Overview

The benchmarking suite consists of multiple tools:

- **index.js**: Runs performance benchmarks on Nexure.js native modules (ThreadPool, StringEncoder)
- **compare.js**: Compares Nexure.js performance against standard Node.js implementations
- **visualize.js**: Generates HTML reports from benchmark results
- **run.js**: All-in-one tool to run benchmarks and open reports

## Running Benchmarks

You can run the benchmarks using npm scripts:

```bash
# Run all benchmarks and generate reports
npm run benchmark:run

# Run individual benchmark tools
npm run benchmark:native    # Run native module benchmarks
npm run benchmark:compare   # Run comparison benchmarks
npm run benchmark:report    # Generate HTML reports from results

# Run everything separately
npm run benchmark:all
```

## Benchmark Reports

Reports are generated in the `benchmark-reports` directory:

- **HTML Reports**: Visual representation of benchmark results with charts and tables
- **JSON Data**: Raw benchmark data in the `benchmark-results` directory

## Customizing Benchmarks

You can customize the benchmarks by editing the source files:

- **Test Data**: Modify the test data constants at the top of each file
- **Iterations**: Adjust iteration counts to increase/decrease benchmark duration
- **Test Cases**: Add new test cases or modify existing ones

## Performance Considerations

For accurate benchmarks:

1. Close other resource-intensive applications before running benchmarks
2. Run benchmarks multiple times and average the results
3. Be aware that the first run may be slower due to JIT compilation and warm-up

## Adding New Benchmarks

To add a new benchmark:

1. Create a new benchmark function in the appropriate file
2. Add the benchmark function to the main execution flow
3. Update the results formatting to include your new benchmark
4. Run the benchmark to validate your changes

## Interpreting Results

When analyzing benchmark results:

- **Operations per second**: Higher is better
- **Average time per operation**: Lower is better
- **Speedup ratio**: Indicates performance relative to baseline (>1 is faster)
