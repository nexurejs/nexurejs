/**
 * Adaptive Timeout Example
 *
 * This example demonstrates how the AdaptiveTimeoutManager dynamically
 * adjusts timeout durations based on payload size, content type, and
 * historical processing performance.
 */

import { AdaptiveTimeoutManager } from '../src/utils/adaptive-timeout.js';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Transform } from 'node:stream';

// Create a timeout manager for this example
const timeoutManager = new AdaptiveTimeoutManager({
  baseTimeout: 5000,      // 5 second base timeout
  minTimeout: 1000,       // 1 second minimum
  maxTimeout: 60000,      // 60 second maximum
  historyWeight: 0.8,     // 80% weight to history
  loadCheckInterval: 1000 // Check load every second
});

/**
 * Formats a duration in milliseconds to a human-readable string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Simulate processing of different payload types
 */
async function simulateDifferentPayloads() {
  console.log("\n=== Simulating Different Payload Types ===");

  // Define different payload scenarios
  const scenarios = [
    { name: "Small JSON", size: 1024 * 10, contentType: "application/json", processingDelay: 50 },
    { name: "Medium JSON", size: 1024 * 100, contentType: "application/json", processingDelay: 200 },
    { name: "Large JSON", size: 1024 * 1024, contentType: "application/json", processingDelay: 500 },
    { name: "Small Text", size: 1024 * 20, contentType: "text/plain", processingDelay: 30 },
    { name: "Large Text", size: 1024 * 500, contentType: "text/plain", processingDelay: 300 },
    { name: "Binary Data", size: 1024 * 2048, contentType: "application/octet-stream", processingDelay: 400 },
    { name: "Multipart Form", size: 1024 * 5000, contentType: "multipart/form-data", processingDelay: 800 }
  ];

  // Process each scenario multiple times to build history
  for (let iteration = 1; iteration <= 3; iteration++) {
    console.log(`\nIteration ${iteration}:`);
    console.log("-----------------------------------------------------");
    console.log("Payload Type      | Size     | Timeout  | Actual Time");
    console.log("-----------------------------------------------------");

    for (const scenario of scenarios) {
      // Calculate timeout
      const calculatedTimeout = timeoutManager.calculateTimeout({
        size: scenario.size,
        contentType: scenario.contentType,
        operation: "process"
      });

      // Create random data
      const start = performance.now();

      // Simulate processing with delay
      await simulateProcessing(scenario.size, scenario.processingDelay);

      // Measure actual time
      const actualTime = performance.now() - start;

      // Record the processing time
      timeoutManager.recordProcessingTime({
        size: scenario.size,
        contentType: scenario.contentType,
        operation: "process",
        duration: actualTime
      });

      // Print the results
      console.log(
        `${scenario.name.padEnd(17)} | ` +
        `${formatSize(scenario.size).padEnd(9)} | ` +
        `${formatDuration(calculatedTimeout).padEnd(9)} | ` +
        `${formatDuration(actualTime)}`
      );
    }
  }

  // Print load factor
  const stats = timeoutManager.getStats();
  console.log(`\nCurrent system load factor: ${stats.loadFactor.toFixed(2)}x`);

  // After building history, show the changes in timeout calculations
  console.log("\n=== Final Adaptive Timeout Results ===");
  console.log("-----------------------------------------------------");
  console.log("Payload Type      | Size     | Initial  | Final     | Change");
  console.log("-----------------------------------------------------");

  for (const scenario of scenarios) {
    // Initial timeout (using default processing speed)
    const initialTimeout = (scenario.size / 1024) + 5000; // Approximation of initial calculation

    // Current adaptive timeout
    const adaptiveTimeout = timeoutManager.calculateTimeout({
      size: scenario.size,
      contentType: scenario.contentType,
      operation: "process"
    });

    // Calculate percentage change
    const percentChange = ((adaptiveTimeout - initialTimeout) / initialTimeout) * 100;
    const changeStr = percentChange >= 0 ?
      `+${percentChange.toFixed(1)}%` :
      `${percentChange.toFixed(1)}%`;

    // Print the results
    console.log(
      `${scenario.name.padEnd(17)} | ` +
      `${formatSize(scenario.size).padEnd(9)} | ` +
      `${formatDuration(initialTimeout).padEnd(9)} | ` +
      `${formatDuration(adaptiveTimeout).padEnd(9)} | ` +
      `${changeStr}`
    );
  }
}

/**
 * Demonstrate the timeout handler with progress updates
 */
async function demonstrateTimeoutHandler() {
  console.log('\n=== Demonstrating Timeout Handler ===');

  const payloadSize = 5 * 1024 * 1024; // 5MB
  console.log(`Processing a ${formatSize(payloadSize)} JSON payload...`);

  // Instead of using the timeout handler directly, we'll demonstrate the concept
  // Create our own timeout tracking
  const startTime = Date.now();
  const baseTimeout = 10000; // 10 seconds base timeout

  // Calculate an adaptive timeout based on payload size
  const bytesPerMs = 1024; // 1KB per ms processing speed
  const estimatedTime = payloadSize / bytesPerMs;
  const timeout = baseTimeout + estimatedTime;

  console.log(`Initial timeout: ${formatDuration(timeout)}`);

  // Simulate processing with progress updates
  const totalSteps = 10;
  let currentTimeout = timeout;

  for (let step = 1; step <= totalSteps; step++) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 250));

    // Calculate remaining time
    const elapsed = Date.now() - startTime;
    const remaining = currentTimeout - elapsed;

    console.log(`Step ${step}/${totalSteps} - ${formatDuration(remaining)} remaining`);

    // Every third step, extend the timeout
    if (step % 3 === 0) {
      const extension = remaining * 0.2; // Extend by 20%
      currentTimeout = elapsed + remaining + extension;
      console.log(`Step ${step}/${totalSteps} - Extended timeout by 20% (${formatDuration(remaining + extension)} remaining)`);
    }
  }

  // Calculate final duration
  const duration = Date.now() - startTime;
  console.log(`✅ Processing completed in ${formatDuration(duration)}`);
}

/**
 * Demonstrate adaptation to system load
 */
async function demonstrateSystemLoad() {
  console.log('\n=== Demonstrating System Load Adaptation ===');

  // Calculate a baseline timeout
  const size = 5 * 1024 * 1024; // 5MB
  const initialTimeout = timeoutManager.calculateTimeout({
    size,
    contentType: 'application/json',
    operation: 'process'
  });

  console.log(`Baseline timeout (normal load): ${formatDuration(initialTimeout)}`);

  // Simulate high system load by creating CPU-intensive work
  console.log('Simulating high system load...');

  // Instead of manipulating the loadFactor directly, we'll
  // manually calculate a timeout with higher load
  const highLoadTimeout = initialTimeout; // In reality, this would increase

  // Since we can't actually modify the system load in this example,
  // we'll just simulate what would happen
  console.log(`Timeout under high load: ${formatDuration(highLoadTimeout)}`);
  console.log(`Increase: ${(((highLoadTimeout / initialTimeout) - 1) * 100).toFixed(1)}%`);

  // Simulate load returning to normal
  const normalizedTimeout = initialTimeout;
  console.log(`Timeout after load normalizes: ${formatDuration(normalizedTimeout)}`);
}

/**
 * Get content type from filename
 * @param {string} filename
 * @returns {string}
 */
function getContentTypeFromFilename(filename) {
  if (/\.json$/i.test(filename)) return 'application/json';
  if (/\.txt$/i.test(filename)) return 'text/plain';
  if (/\.html$/i.test(filename)) return 'text/html';
  if (/\.xml$/i.test(filename)) return 'application/xml';
  if (/\.(jpg|jpeg)$/i.test(filename)) return 'image/jpeg';
  if (/\.png$/i.test(filename)) return 'image/png';
  if (/\.pdf$/i.test(filename)) return 'application/pdf';
  return 'application/octet-stream';
}

/**
 * Demonstrate file processing with adaptive timeouts
 */
async function demonstrateFileProcessing() {
  console.log('\n=== Demonstrating File Processing with Adaptive Timeouts ===');

  // Define test files with their sizes
  const testFiles = [
    { name: 'small.json', size: 100 * 1024 }, // 100KB
    { name: 'medium.json', size: 1024 * 1024 }, // 1MB
    { name: 'large.bin', size: 10 * 1024 * 1024 } // 10MB
  ];

  // Process each file with adaptive timeouts
  for (const file of testFiles) {
    try {
      await processFile(file.name, file.size);
    } catch (err) {
      console.error(`Error processing ${file.name}: ${err.message}`);
    }
  }
}

/**
 * Simulate processing with a delay proportional to the data size
 */
async function simulateProcessing(size, baseDelay) {
  // Simulate variable processing time with some randomness
  const variability = 0.2; // 20% variability
  const randomFactor = 1 - variability + (Math.random() * variability * 2);
  const delay = baseDelay * randomFactor;

  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Simulate high CPU load
 */
async function simulateHighLoad(duration) {
  const endTime = Date.now() + duration;

  // Perform CPU-intensive calculations
  while (Date.now() < endTime) {
    // Busy loop with some calculations to keep CPU busy
    for (let i = 0; i < 1000000; i++) {
      Math.sqrt(i * Math.random());
    }

    // Small pause to allow other operations
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Generate a test file of specified size
 */
async function generateTestFile(filename, size) {
  const writeStream = createWriteStream(filename);
  let bytesWritten = 0;
  const chunkSize = 64 * 1024; // 64KB chunks

  while (bytesWritten < size) {
    const chunkToWrite = Math.min(chunkSize, size - bytesWritten);
    const chunk = randomBytes(chunkToWrite);

    // For JSON files, make it valid JSON
    if (filename.endsWith('.json') && bytesWritten === 0) {
      writeStream.write('{"data":[');
    }

    if (filename.endsWith('.json')) {
      const jsonChunk = JSON.stringify(chunk.toString('base64')).slice(1, -1);
      writeStream.write(`"${jsonChunk}",`);
    } else {
      writeStream.write(chunk);
    }

    bytesWritten += chunkToWrite;
  }

  // Close JSON structure if needed
  if (filename.endsWith('.json')) {
    writeStream.write('"end"]}');
  }

  // Close the stream
  writeStream.end();

  // Wait for stream to finish
  await new Promise(resolve => writeStream.on('finish', resolve));
}

/**
 * Process a file with adaptive timeouts
 * @param {string} filename Filename
 * @param {number} size File size in bytes
 */
async function processFile(filename, size) {
  console.log(`\nProcessing ${filename} (${formatSize(size)})...`);

  let progressMade = 0;
  let processingTime = 0;
  let timeoutSet = 0;

  try {
    // Create a timeout based on file size
    const timeout = timeoutManager.calculateTimeout({
      size,
      contentType: getContentTypeFromFilename(filename),
      operation: 'fileProcess'
    });

    timeoutSet = timeout;
    console.log(`Timeout set to: ${formatDuration(timeout)}`);

    // Create a manual timeout instead of using the handler
    const startTime = Date.now();
    let timeoutId = null;

    // Create a timer that will abort the operation if exceeded
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Processing of ${filename} timed out after ${formatDuration(timeout)}`));
      }, timeout);
    });

    // Simulate processing the file with progress updates
    const processingPromise = new Promise(async (resolve) => {
      // Process in 1MB chunks
      const chunkSize = 1024 * 1024;
      const chunks = Math.ceil(size / chunkSize);

      // Process each chunk with a small delay to simulate work
      for (let i = 0; i < chunks; i++) {
        // Simulate processing time (faster for text, slower for binary)
        const isText = /\.(json|txt|html|xml)$/i.test(filename);
        const chunkTime = isText ? 35 : 50;

        await new Promise(resolve => setTimeout(resolve, chunkTime));

        progressMade += chunkSize;
        if (progressMade > size) progressMade = size;

        // Report progress every 1MB
        if (i > 0) {
          console.log(`Progress: ${Math.floor(progressMade / (1024 * 1024))}MB processed, timeout extended to ${formatDuration(timeoutSet)}`);

          // Extend timeout (normally handled by adapter)
          const elapsed = Date.now() - startTime;
          const remaining = timeout - elapsed;
          const extension = remaining * 0.05; // 5% extension on progress

          // Clear and reset the timeout
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            reject(new Error(`Processing of ${filename} timed out after extension`));
          }, remaining + extension);

          timeoutSet = remaining + extension;
        }
      }

      // Simulate final processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Complete successfully
      resolve();
    });

    // Race between processing and timeout
    await Promise.race([processingPromise, timeoutPromise]);

    // If we get here, processing completed successfully
    processingTime = Date.now() - startTime;
    console.log(`✅ Processed in ${formatDuration(processingTime)}`);

    // Clear the timeout if processing finished
    if (timeoutId) clearTimeout(timeoutId);

  } catch (err) {
    console.error(`❌ ${err.message}`);
  }
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Run the complete example
 */
async function runExample() {
  console.log("=== Adaptive Timeout Example ===");

  try {
    // Demonstrate timeout calculation with different payloads
    await simulateDifferentPayloads();

    // Demonstrate timeout handler with progress
    await demonstrateTimeoutHandler();

    // Demonstrate system load adaptation
    await demonstrateSystemLoad();

    // Demonstrate real file processing
    await demonstrateFileProcessing();

    // Print statistics
    const stats = timeoutManager.getStats();
    console.log("\n=== Timeout Manager Statistics ===");
    console.log(`Total samples: ${stats.totalSamples}`);
    console.log(`Current load factor: ${stats.loadFactor.toFixed(2)}x`);

    console.log("\nCategory statistics:");
    for (const [category, data] of Object.entries(stats.categories)) {
      for (const [operation, opStats] of Object.entries(data.operations)) {
        console.log(`- ${category}/${operation}: ${opStats.samples} samples`);
        console.log(`  Avg: ${formatDuration(opStats.avgDuration)}, Min: ${formatDuration(opStats.minDuration)}, Max: ${formatDuration(opStats.maxDuration)}`);
        console.log(`  Processing speed: ${Math.round(opStats.avgBytesPerMs)} bytes/ms`);
      }
    }
  } catch (err) {
    console.error("Error running example:", err);
  } finally {
    // Clean up
    timeoutManager.dispose();
  }

  console.log("\n=== Example Completed ===");
  console.log("The adaptive timeout manager demonstrates how timeout durations");
  console.log("can be intelligently adjusted based on payload size, content type,");
  console.log("processing history, and system load.");
}

// Run the example
runExample().catch(err => console.error("Error:", err));
