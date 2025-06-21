#!/usr/bin/env node

/**
 * NexureJS Health Check
 * Comprehensive health check for monitoring and deployment
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class HealthCheck {
  constructor(options = {}) {
    this.options = {
      timeout: 5000,
      verbose: false,
      ...options
    };
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  async run() {
    console.log('🏥 NexureJS Health Check\n');

    await this.checkProject();
    await this.checkDependencies();
    await this.checkBuild();

    this.printSummary();

    return this.failed === 0;
  }

  async checkProject() {
    console.log('📦 Project Health');

    // Check package.json
    await this.check('Package.json exists', async () => {
      const packagePath = path.join(rootDir, 'package.json');
      await fs.access(packagePath);

      const data = await fs.readFile(packagePath, 'utf8');
      const pkg = JSON.parse(data);

      if (!pkg.name || !pkg.version) {
        throw new Error('Missing name or version');
      }
    });

    // Check essential files
    const essentialFiles = [
      'README.md',
      'LICENSE',
      'tsconfig.json',
      'src/index.ts'
    ];

    for (const file of essentialFiles) {
      await this.check(`${file} exists`, async () => {
        await fs.access(path.join(rootDir, file));
      });
    }

    // Check directory structure
    const essentialDirs = [
      'src',
      'docs',
      'examples',
      'test'
    ];

    for (const dir of essentialDirs) {
      await this.check(`${dir}/ directory exists`, async () => {
        await fs.access(path.join(rootDir, dir));
      });
    }
  }

  async checkDependencies() {
    console.log('\n📋 Dependencies Health');

    // Check node_modules
    await this.check('node_modules exists', async () => {
      await fs.access(path.join(rootDir, 'node_modules'));
    });

    // Check critical dependencies
    const criticalDeps = [
      'typescript',
      'vitest',
      'eslint'
    ];

    for (const dep of criticalDeps) {
      await this.check(`${dep} installed`, async () => {
        await fs.access(path.join(rootDir, 'node_modules', dep));
      });
    }
  }

  async checkBuild() {
    console.log('\n🔨 Build Health');

    // Check if dist directory exists
    await this.check('Build artifacts exist', async () => {
      const distPath = path.join(rootDir, 'dist');
      try {
        await fs.access(distPath);
        const files = await fs.readdir(distPath);
        if (files.length === 0) {
          throw new Error('No build artifacts found');
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error('Build directory not found - run npm run build');
        }
        throw error;
      }
    });

    // Check native modules if they exist
    await this.check('Native modules status', async () => {
      const buildPath = path.join(rootDir, 'build');
      try {
        await fs.access(buildPath);
        // Native modules exist, check if they're built
        const files = await fs.readdir(buildPath);
        if (files.length === 0) {
          throw new Error('Native modules not built');
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          // No native modules, that's okay
          return;
        }
        throw error;
      }
    });
  }

  async check(name, checkFn) {
    process.stdout.write(`  ${name}... `);

    try {
      await checkFn();
      console.log('✅');
      this.passed++;
      this.checks.push({ name, status: 'passed' });
    } catch (error) {
      console.log(`❌ ${error.message}`);
      this.failed++;
      this.checks.push({ name, status: 'failed', error: error.message });
    }
  }

  printSummary() {
    console.log('\n📊 Health Check Summary');
    console.log('========================');
    console.log(`Total checks: ${this.passed + this.failed}`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);

    const healthScore = ((this.passed / (this.passed + this.failed)) * 100).toFixed(1);
    console.log(`🏥 Health Score: ${healthScore}%`);

    if (this.failed > 0) {
      console.log('\nFailed checks:');
      this.checks
        .filter(c => c.status === 'failed')
        .forEach(c => console.log(`  ❌ ${c.name}: ${c.error}`));
    }

    if (this.failed === 0) {
      console.log('\n🎉 All health checks passed! NexureJS is healthy.');
    } else {
      console.log('\n⚠️  Some health checks failed. Please review and fix issues.');
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    timeout: parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1]) || 5000
  };

  const healthCheck = new HealthCheck(options);
  const healthy = await healthCheck.run();

  process.exit(healthy ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { HealthCheck };
