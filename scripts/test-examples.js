#!/usr/bin/env node

/**
 * NexureJS Example Testing Automation
 * Automatically tests all examples to ensure they work correctly
 */

import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const examplesDir = path.join(rootDir, 'examples');

class ExampleTester {
  constructor(options = {}) {
    this.options = {
      timeout: 10000,
      verbose: false,
      category: 'all',
      ...options
    };
    this.results = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async run() {
    console.log('🧪 NexureJS Example Testing Automation\n');

    const categories = await this.getTestCategories();
    const targetCategories = this.options.category === 'all'
      ? categories
      : categories.filter(cat => cat.name === this.options.category);

    for (const category of targetCategories) {
      await this.testCategory(category);
    }

    this.printSummary();
    return this.failedTests === 0;
  }

  async getTestCategories() {
    const categories = [
      {
        name: 'basic',
        path: 'basic',
        description: 'Basic examples',
        tests: [
          { file: 'simple-server.js', type: 'server', port: 3001 },
          { file: 'middleware-basics.js', type: 'server', port: 3002 },
          { file: 'error-handling-example.js', type: 'server', port: 3003 }
        ]
      },
      {
        name: 'api',
        path: 'api',
        description: 'API development examples',
        tests: [
          { file: 'input-validation.js', type: 'server', port: 3004 }
        ]
      },
      {
        name: 'performance',
        path: 'performance',
        description: 'Performance examples',
        tests: [
          { file: 'streaming.js', type: 'server', port: 3006 }
        ]
      },
      {
        name: 'production',
        path: 'production-examples',
        description: 'Production examples',
        tests: [
          { file: 'high-performance-api.cjs', type: 'server', port: 3009 }
        ]
      }
    ];

    // Filter categories that exist
    const existingCategories = [];
    for (const category of categories) {
      const categoryPath = path.join(examplesDir, category.path);
      try {
        await fs.access(categoryPath);
        // Filter tests for files that exist
        const existingTests = [];
        for (const test of category.tests) {
          const testPath = path.join(categoryPath, test.file);
          try {
            await fs.access(testPath);
            existingTests.push(test);
          } catch (err) {
            if (this.options.verbose) {
              console.log(`⚠️  Skipping ${test.file} (not found)`);
            }
          }
        }
        if (existingTests.length > 0) {
          existingCategories.push({ ...category, tests: existingTests });
        }
      } catch (err) {
        if (this.options.verbose) {
          console.log(`⚠️  Skipping category ${category.name} (directory not found)`);
        }
      }
    }

    return existingCategories;
  }

  async testCategory(category) {
    console.log(`\n📁 Testing ${category.description}...`);

    for (const test of category.tests) {
      await this.testExample(category, test);
    }
  }

  async testExample(category, test) {
    this.totalTests++;
    const testPath = path.join(examplesDir, category.path, test.file);
    const testName = `${category.name}/${test.file}`;

    console.log(`  🧪 Testing ${testName}...`);

    try {
      if (test.type === 'script') {
        await this.testScript(testPath, testName);
      } else if (test.type === 'server') {
        await this.testServer(testPath, testName, test.port);
      }

      console.log(`  ✅ ${testName} passed`);
      this.passedTests++;
      this.results.push({ name: testName, status: 'passed' });
    } catch (error) {
      console.log(`  ❌ ${testName} failed: ${error.message}`);
      this.failedTests++;
      this.results.push({ name: testName, status: 'failed', error: error.message });
    }
  }

  async testScript(scriptPath, testName) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [scriptPath], {
        stdio: 'pipe',
        timeout: this.options.timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Kill process after timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Timeout'));
      }, this.options.timeout);
    });
  }

  async testServer(serverPath, testName, port) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [serverPath], {
        stdio: 'pipe',
        env: { ...process.env, PORT: port.toString() }
      });

      let stdout = '';
      let stderr = '';
      let serverStarted = false;

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Check if server started
        if (output.includes('Server running') ||
            output.includes('listening') ||
            output.includes('started') ||
            output.includes(`${port}`)) {
          serverStarted = true;
          setTimeout(() => {
            child.kill('SIGTERM');
            resolve({ stdout, stderr });
          }, 1000); // Wait 1s then kill
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (!serverStarted) {
          reject(new Error(`Server failed to start: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Timeout
      setTimeout(() => {
        if (!serverStarted) {
          child.kill('SIGTERM');
          reject(new Error('Server start timeout'));
        }
      }, this.options.timeout);
    });
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log(`Total tests: ${this.totalTests}`);
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(`Success rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%\n`);

    if (this.failedTests > 0) {
      console.log('Failed tests:');
      this.results
        .filter(r => r.status === 'failed')
        .forEach(r => console.log(`  ❌ ${r.name}: ${r.error}`));
      console.log();
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    timeout: parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1]) || 10000,
    category: 'all'
  };

  // Parse category
  if (args.includes('--basic')) options.category = 'basic';
  else if (args.includes('--advanced')) options.category = 'specialized';
  else if (args.includes('--api')) options.category = 'api';
  else if (args.includes('--performance')) options.category = 'performance';
  else if (args.includes('--production')) options.category = 'production';
  else if (args.includes('--all')) options.category = 'all';

  const tester = new ExampleTester(options);
  const success = await tester.run();

  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ExampleTester };
