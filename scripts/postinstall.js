#!/usr/bin/env node

/**
 * NexureJS Post-Install Setup
 * Sets up the project after npm install
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

async function main() {
  console.log('🔧 NexureJS Post-Install Setup\n');

  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI || process.env.CONTINUOUS_INTEGRATION;

    if (isCI) {
      console.log('📦 CI environment detected, skipping interactive setup');
      return;
    }

    // Check if this is a development install
    const isDev = await checkDevelopmentInstall();

    if (!isDev) {
      console.log('📦 Production install detected, skipping development setup');
      return;
    }

    console.log('🛠️  Development environment detected, setting up...\n');

    // Setup tasks
    await setupGitHooks();
    await checkNativeBuildTools();
    await createDirectories();
    await showWelcomeMessage();

  } catch (error) {
    console.error('❌ Post-install setup failed:', error.message);
    // Don't fail the install if post-install fails
    process.exit(0);
  }
}

async function checkDevelopmentInstall() {
  try {
    // Check if we have dev dependencies
    const packagePath = path.join(rootDir, 'package.json');
    const packageData = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(packageData);

    // Check if node_modules has dev dependencies
    try {
      await fs.access(path.join(rootDir, 'node_modules', 'typescript'));
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function setupGitHooks() {
  try {
    console.log('🪝 Setting up Git hooks...');

    // Check if we're in a git repository
    try {
      await execAsync('git status', { cwd: rootDir });
    } catch {
      console.log('  ⚠️  Not a git repository, skipping Git hooks');
      return;
    }

    // Check if husky is available
    try {
      await fs.access(path.join(rootDir, 'node_modules', '.bin', 'husky'));
      await execAsync('npx husky install', { cwd: rootDir });
      console.log('  ✅ Git hooks configured');
    } catch {
      console.log('  ⚠️  Husky not available, skipping Git hooks');
    }
  } catch (error) {
    console.log('  ❌ Failed to setup Git hooks:', error.message);
  }
}

async function checkNativeBuildTools() {
  console.log('🔨 Checking native build tools...');

  const tools = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion >= 18) {
    tools.push('✅ Node.js ' + nodeVersion);
  } else {
    tools.push('❌ Node.js ' + nodeVersion + ' (requires >=18)');
  }

  // Check node-gyp
  try {
    const { stdout } = await execAsync('node-gyp --version');
    tools.push('✅ node-gyp ' + stdout.trim());
  } catch {
    tools.push('❌ node-gyp (not found)');
  }

  // Check Python
  try {
    const { stdout } = await execAsync('python --version');
    tools.push('✅ ' + stdout.trim());
  } catch {
    try {
      const { stdout } = await execAsync('python3 --version');
      tools.push('✅ ' + stdout.trim());
    } catch {
      tools.push('❌ Python (not found)');
    }
  }

  // Check C++ compiler
  if (process.platform === 'win32') {
    try {
      await execAsync('cl');
      tools.push('✅ MSVC Compiler');
    } catch {
      tools.push('❌ MSVC Compiler (not found)');
    }
  } else {
    try {
      const { stdout } = await execAsync('gcc --version');
      tools.push('✅ GCC Compiler');
    } catch {
      try {
        const { stdout } = await execAsync('clang --version');
        tools.push('✅ Clang Compiler');
      } catch {
        tools.push('❌ C++ Compiler (not found)');
      }
    }
  }

  tools.forEach(tool => console.log('  ' + tool));

  const missingTools = tools.filter(tool => tool.startsWith('❌'));
  if (missingTools.length > 0) {
    console.log('\n  ⚠️  Some build tools are missing. Native modules may not compile.');
    console.log('  📖 See docs/getting-started/installation.md for setup instructions');
  }
}

async function createDirectories() {
  console.log('📁 Creating project directories...');

  const directories = [
    'coverage',
    'logs',
    'tmp'
  ];

  for (const dir of directories) {
    const dirPath = path.join(rootDir, dir);
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`  ✅ Created ${dir}/`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.log(`  ❌ Failed to create ${dir}/: ${error.message}`);
      }
    }
  }
}

async function showWelcomeMessage() {
  console.log('\n🎉 NexureJS Development Environment Ready!\n');

  console.log('📚 Quick Start:');
  console.log('  npm run dev          - Start development server');
  console.log('  npm run build:all    - Build everything');
  console.log('  npm run test         - Run tests');
  console.log('  npm run benchmark    - Run benchmarks');
  console.log('  npm run info         - Show system information');

  console.log('\n📖 Documentation:');
  console.log('  docs/getting-started/first-app.md    - Build your first app');
  console.log('  docs/core/                           - Core framework docs');
  console.log('  examples/                            - Example applications');

  console.log('\n🚀 Happy coding with NexureJS!\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
