#!/usr/bin/env node

/**
 * NexureJS System Information
 * Displays system information for debugging and development
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('🔍 NexureJS System Information\n');

  // Node.js Information
  console.log('🟢 Node.js');
  console.log(`  Version: ${process.version}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Architecture: ${process.arch}`);
  console.log(`  Memory Usage: ${formatBytes(process.memoryUsage().rss)}`);
  console.log(`  V8 Version: ${process.versions.v8}`);

  // System Information
  console.log('\n💻 System');
  console.log(`  OS: ${os.type()} ${os.release()}`);
  console.log(`  Hostname: ${os.hostname()}`);
  console.log(`  CPUs: ${os.cpus().length} cores`);
  if (os.cpus().length > 0) {
    console.log(`  CPU Model: ${os.cpus()[0].model}`);
  }
  console.log(`  Total Memory: ${formatBytes(os.totalmem())}`);
  console.log(`  Free Memory: ${formatBytes(os.freemem())}`);
  console.log(`  Load Average: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`);

  // Project Information
  console.log('\n📦 Project');
  try {
    const packagePath = path.join(rootDir, 'package.json');
    const packageData = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(packageData);

    console.log(`  Name: ${pkg.name}`);
    console.log(`  Version: ${pkg.version}`);
    console.log(`  Node Required: ${pkg.engines?.node || 'Not specified'}`);
    console.log(`  Module Type: ${pkg.type || 'CommonJS'}`);
    console.log(`  Scripts: ${Object.keys(pkg.scripts || {}).length}`);
    console.log(`  Dependencies: ${Object.keys(pkg.dependencies || {}).length}`);
    console.log(`  Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).length}`);

    // Check if native modules are built
    try {
      await fs.access(path.join(rootDir, 'build'));
      console.log(`  Native Built: ✅`);
    } catch {
      console.log(`  Native Built: ❌`);
    }

    // Check dist directory
    try {
      await fs.access(path.join(rootDir, 'dist'));
      console.log(`  TypeScript Built: ✅`);
    } catch {
      console.log(`  TypeScript Built: ❌`);
    }

  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }

  // Native Modules Information
  console.log('\n⚡ Native Modules');
  try {
    // Check for native build tools
    try {
      const { stdout } = await execAsync('node-gyp --version');
      console.log(`  Node-gyp: ${stdout.trim()}`);
    } catch {
      console.log(`  Node-gyp: Not found`);
    }

    try {
      const { stdout } = await execAsync('python --version');
      console.log(`  Python: ${stdout.trim()}`);
    } catch {
      try {
        const { stdout } = await execAsync('python3 --version');
        console.log(`  Python: ${stdout.trim()}`);
      } catch {
        console.log(`  Python: Not found`);
      }
    }

    // Check for C++ compiler
    if (process.platform === 'win32') {
      try {
        await execAsync('cl');
        console.log(`  Compiler: MSVC`);
      } catch {
        console.log(`  Compiler: Not found`);
      }
    } else {
      try {
        const { stdout } = await execAsync('gcc --version');
        console.log(`  Compiler: ${stdout.split('\n')[0]}`);
      } catch {
        try {
          const { stdout } = await execAsync('clang --version');
          console.log(`  Compiler: ${stdout.split('\n')[0]}`);
        } catch {
          console.log(`  Compiler: Not found`);
        }
      }
    }

    // Check if native modules are available
    try {
      const nativeDir = path.join(rootDir, 'src/native');
      const entries = await fs.readdir(nativeDir, { withFileTypes: true });
      const modules = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      console.log(`  Available: ✅`);
      console.log(`  Modules: ${modules.length}`);
      if (modules.length > 0) {
        console.log(`    - ${modules.slice(0, 5).join('\n    - ')}`);
        if (modules.length > 5) {
          console.log(`    ... and ${modules.length - 5} more`);
        }
      }
    } catch {
      console.log(`  Available: ❌`);
    }

  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }

  // Dependencies Information
  console.log('\n📋 Dependencies');
  try {
    // Get npm version
    const { stdout: npmVersion } = await execAsync('npm --version');
    console.log(`  NPM Version: ${npmVersion.trim()}`);

    // Check for outdated packages (with timeout)
    try {
      const { stdout: outdated } = await execAsync('npm outdated --json', { timeout: 5000 });
      if (outdated.trim()) {
        const outdatedData = JSON.parse(outdated);
        const outdatedList = Object.keys(outdatedData);
        console.log(`  Outdated Packages: ${outdatedList.length}`);
        if (outdatedList.length > 0) {
          console.log(`    - ${outdatedList.slice(0, 3).join('\n    - ')}`);
          if (outdatedList.length > 3) {
            console.log(`    ... and ${outdatedList.length - 3} more`);
          }
        }
      } else {
        console.log(`  Outdated Packages: 0`);
      }
    } catch {
      console.log(`  Outdated Packages: Check failed`);
    }

  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }

  console.log('\n🎯 Quick Actions');
  console.log('  npm run build:all    - Build everything');
  console.log('  npm run test:all     - Run all tests');
  console.log('  npm run benchmark    - Run benchmarks');
  console.log('  npm run deps:check   - Check dependencies');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
