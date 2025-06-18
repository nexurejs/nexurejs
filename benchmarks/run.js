#!/usr/bin/env node
// Nexure.js Benchmark Runner
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../benchmark-reports');

// Helper to run a command
const runCommand = (command, args) => {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, { stdio: 'inherit' });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
};

// Run the benchmark suite
const runBenchmarks = async () => {
  try {
    console.log('Starting Nexure.js Benchmark Suite...');

    // Ensure the reports directory exists
    try {
      await fs.mkdir(REPORTS_DIR, { recursive: true });
    } catch (err) {
      // Ignore if directory already exists
    }

    // Step 1: Run the native module benchmarks
    console.log('\n📊 Running native module benchmarks...');
    await runCommand('node', [path.join(__dirname, 'index.js')]);

    // Step 2: Run comparison benchmarks
    console.log('\n🔄 Running comparison benchmarks...');
    await runCommand('node', [path.join(__dirname, 'compare.js')]);

    // Step 3: Generate visual reports
    console.log('\n📈 Generating visual reports...');
    await runCommand('node', [path.join(__dirname, 'visualize.js')]);

    // Step 4: Open the benchmark report in browser
    console.log('\n🌐 Opening benchmark report in default browser...');

    // Try to find the most recent report
    const files = await fs.readdir(REPORTS_DIR);

    // If index.html exists, open it
    if (files.includes('index.html')) {
      await open(path.join(REPORTS_DIR, 'index.html'));
    } else {
      // Otherwise open the most recent report
      const jsonFiles = files.filter(f => f.endsWith('.html'));

      if (jsonFiles.length > 0) {
        // Sort by date (most recent first)
        const mostRecent = jsonFiles.sort().pop();
        await open(path.join(REPORTS_DIR, mostRecent));
      } else {
        console.log('No report files found to open.');
      }
    }

    console.log('\n✅ Benchmark suite completed successfully!');
  } catch (error) {
    console.error('\n❌ Benchmark suite failed:', error.message);
    process.exit(1);
  }
};

runBenchmarks();
