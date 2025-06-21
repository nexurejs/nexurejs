/**
 * Adaptive Buffer Pool Example
 *
 * This example demonstrates how the BufferPool adapts to different workload patterns,
 * optimizing memory usage based on actual buffer size requirements.
 */

import { BufferPool } from '../src/utils/buffer-pool.js';
import { performance } from 'node:perf_hooks';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { Transform } from 'node:stream';

// Create two buffer pools for comparison
const adaptivePool = new BufferPool({
  initialSize: 20,
  maxSize: 1000,
  adaptive: true,
  adaptiveInterval: 1000, // 1 second adaptation interval for demo
  minBufferSize: 1024,     // 1KB
  maxBufferSize: 2 * 1024 * 1024 // 2MB
});

const standardPool = new BufferPool({
  initialSize: 20,
  maxSize: 1000,
  adaptive: false,
  bufferSize: 16 * 1024 // 16KB standard size
});

/**
 * Creates an optimized transform that uses a buffer pool
 */
function createPooledTransform(pool, processor) {
  return new Transform({
    transform(chunk, encoding, callback) {
      // Get a buffer from the pool
      const pooledBuffer = pool.acquire(chunk.length);

      // Copy data to pooled buffer
      chunk.copy(pooledBuffer);

      // Process the data
      if (processor) {
        processor(pooledBuffer);
      }

      // Push the processed data
      this.push(pooledBuffer);

      // Schedule buffer release
      process.nextTick(() => {
        pool.release(pooledBuffer);
      });

      callback();
    }
  });
}

/**
 * Generate a pattern of different sized buffers to simulate a mixed workload
 */
async function generateMixedWorkload() {
  console.log("\n=== Generating Mixed Workload ===");

  // Define workload patterns with different buffer sizes
  const patterns = [
    { name: "Small buffers (2-4KB)", sizes: [2048, 4096], count: 1000 },
    { name: "Medium buffers (16-32KB)", sizes: [16384, 32768], count: 500 },
    { name: "Large buffers (256KB-1MB)", sizes: [262144, 1048576], count: 50 }
  ];

  // Run each pattern in sequence for both pools
  for (const pattern of patterns) {
    console.log(`\nProcessing pattern: ${pattern.name}`);
    console.log(`Generating ${pattern.count} buffers of ${pattern.sizes[0]}-${pattern.sizes[1]} bytes`);

    // Process with adaptive pool
    await processPattern(adaptivePool, pattern, "Adaptive");

    // Process with standard pool
    await processPattern(standardPool, pattern, "Standard");

    // Print comparison
    console.log("\nComparison after pattern:");
    printPoolComparison();
  }
}

/**
 * Process a specific workload pattern with a given pool
 */
async function processPattern(pool, pattern, poolName) {
  const { sizes, count } = pattern;

  console.log(`\n${poolName} Pool - Starting pattern`);
  const startTime = performance.now();

  // Process buffers
  for (let i = 0; i < count; i++) {
    // Select random size within range
    const size = sizes[0] + Math.floor(Math.random() * (sizes[1] - sizes[0]));

    // Get buffer and process it
    const buffer = pool.acquire(size);
    randomBytes(size).copy(buffer);

    // Do some processing (hash calculation)
    const hash = createHash('md5');
    hash.update(buffer);
    const digest = hash.digest();

    // Release buffer
    pool.release(buffer);

    // Log progress
    if (i % (count / 5) === 0) {
      process.stdout.write(".");
    }
  }

  const duration = performance.now() - startTime;
  console.log(`\n${poolName} Pool - Completed in ${duration.toFixed(2)}ms`);

  // Print stats
  const stats = pool.getStats();
  console.log(`  Hits: ${stats.hits}, Misses: ${stats.misses}, Efficiency: ${(stats.efficiency * 100).toFixed(2)}%`);
  if (poolName === "Adaptive") {
    console.log(`  Adaptations: ${stats.adapts}`);
  }
}

/**
 * Print a comparison of both pools
 */
function printPoolComparison() {
  const adaptiveStats = adaptivePool.getStats();
  const standardStats = standardPool.getStats();

  console.log("=== Pool Comparison ===");
  console.log("Metric             | Adaptive Pool    | Standard Pool");
  console.log("-------------------|------------------|------------------");
  console.log(`Hit Rate           | ${(adaptiveStats.efficiency * 100).toFixed(2)}%`.padEnd(18) + ` | ${(standardStats.efficiency * 100).toFixed(2)}%`);
  console.log(`Total Allocated    | ${formatBytes(adaptiveStats.totalAllocated)}`.padEnd(18) + ` | ${formatBytes(standardStats.totalAllocated)}`);
  console.log(`Buffers Created    | ${adaptiveStats.created}`.padEnd(18) + ` | ${standardStats.created}`);
  console.log(`Current Pools      | ${adaptiveStats.currentPools}`.padEnd(18) + ` | ${standardStats.currentPools}`);

  // Show pool sizes for adaptive pool
  console.log("\nAdaptive Pool Sizes:");
  const sizes = Object.entries(adaptiveStats.poolSizes)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  for (const [size, count] of sizes) {
    if (count > 0) {
      console.log(`  ${formatBytes(parseInt(size))}: ${count} buffers`);
    }
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Real-world example: File processing with adaptive buffer pools
 */
async function fileProcessingExample() {
  console.log("\n=== File Processing Example ===");

  // Create a large test file if needed
  const testFile = "test-file.dat";
  const outputAdaptive = "output-adaptive.gz";
  const outputStandard = "output-standard.gz";

  // Generate random data
  console.log("Processing large files using both pools...");

  // Process with adaptive pool
  console.log("\nProcessing with adaptive pool...");
  const adaptiveStart = performance.now();
  await processFileWithPool(adaptivePool, testFile, outputAdaptive);
  const adaptiveTime = performance.now() - adaptiveStart;

  // Process with standard pool
  console.log("\nProcessing with standard pool...");
  const standardStart = performance.now();
  await processFileWithPool(standardPool, testFile, outputStandard);
  const standardTime = performance.now() - standardStart;

  // Print results
  console.log("\n=== File Processing Results ===");
  console.log(`Adaptive Pool: ${adaptiveTime.toFixed(2)}ms`);
  console.log(`Standard Pool: ${standardTime.toFixed(2)}ms`);
  console.log(`Difference: ${Math.abs(((adaptiveTime - standardTime) / standardTime) * 100).toFixed(2)}%`);

  // Print final comparison
  console.log("\nFinal Pool Comparison:");
  printPoolComparison();
}

/**
 * Process a file using the specified buffer pool
 */
async function processFileWithPool(pool, inputFile, outputFile) {
  try {
    // Create streams
    const sourceStream = createReadStream(inputFile);
    const gzipStream = createGzip();
    const destStream = createWriteStream(outputFile);

    // Create transform stream that uses the buffer pool
    const pooledTransform = createPooledTransform(pool, (buffer) => {
      // Simple transformation - uppercase any text
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] >= 97 && buffer[i] <= 122) { // lowercase a-z
          buffer[i] -= 32; // convert to uppercase
        }
      }
    });

    // Run the pipeline
    await pipeline(
      sourceStream,
      pooledTransform,
      gzipStream,
      destStream
    );
  } catch (err) {
    console.error("Error processing file:", err);
  }
}

/**
 * Generate a test file filled with random data
 */
async function generateTestFile(filename, sizeMB) {
  console.log(`Generating ${sizeMB}MB test file...`);

  const writeStream = createWriteStream(filename);
  let written = 0;
  const totalBytes = sizeMB * 1024 * 1024;
  const chunkSize = 1024 * 1024; // 1MB chunks

  // Write in chunks
  while (written < totalBytes) {
    const size = Math.min(chunkSize, totalBytes - written);
    const chunk = randomBytes(size);

    if (!writeStream.write(chunk)) {
      // Wait for drain event if buffer is full
      await new Promise(resolve => writeStream.once('drain', resolve));
    }

    written += size;
    process.stdout.write('.');
  }

  // Close stream
  await new Promise(resolve => writeStream.end(resolve));
  console.log(`\nCreated ${filename} (${sizeMB}MB)`);
}

/**
 * Run the complete example
 */
async function runExample() {
  console.log("=== Adaptive Buffer Pool Example ===");

  // First create a test file
  const testFileSizeMB = 10; // 10MB file
  await generateTestFile("test-file.dat", testFileSizeMB);

  // Run mixed workload example
  await generateMixedWorkload();

  // Run file processing example
  await fileProcessingExample();

  console.log("\n=== Example Completed ===");
  console.log("The adaptive buffer pool demonstrates better memory utilization");
  console.log("by dynamically adjusting to workload patterns while maintaining");
  console.log("high performance for real-world streaming operations.");
}

// Run the example
runExample().catch(err => console.error("Error running example:", err));
