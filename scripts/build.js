/**
 * Cross-Platform Native Module Build Manager
 *
 * This script manages the process of building native modules for all supported platforms:
 * - macOS (arm64, x64)
 * - Linux (x64)
 * - Windows (x64)
 *
 * It can:
 * 1. Build for the current platform
 * 2. Generate build scripts for other platforms
 * 3. Check Docker availability for cross-platform builds
 * 4. Collect and organize build artifacts
 * 5. Create platform-specific packages
 * 6. Clean build directories
 * 7. Fix import paths in TypeScript output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import fsPromises from 'node:fs/promises';
import https from 'node:https';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const distDir = path.join(rootDir, 'dist');
const packagesDir = path.join(rootDir, 'packages');
const srcDir = path.join(rootDir, 'dist'); // Define srcDir globally to avoid errors

// ANSI color codes for console output
const Colors = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  BOLD: '\x1b[1m'
};

// Supported platforms
const SUPPORTED_PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', name: 'macOS (ARM64)' },
  { platform: 'darwin', arch: 'x64', name: 'macOS (x64)' },
  { platform: 'linux', arch: 'x64', name: 'Linux (x64)' },
  { platform: 'win32', arch: 'x64', name: 'Windows (x64)' }
];

// Current platform
const CURRENT_PLATFORM = platform();
const CURRENT_ARCH = arch();

// Check for Docker availability
let dockerAvailable = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  dockerAvailable = true;
} catch (err) {
  // Docker not available
}

/**
 * Print a section header
 */
function printSectionHeader(title) {
  console.log(`\n${Colors.CYAN}${Colors.BOLD}${title}${Colors.RESET}`);
  console.log(`${Colors.CYAN}${'='.repeat(title.length)}${Colors.RESET}`);
}

/**
 * Get the package info
 */
function getPackageInfo() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    return {
      name: packageJson.name,
      version: packageJson.version
    };
  } catch (err) {
    console.error(`${Colors.RED}Failed to read package.json:${Colors.RESET}`, err.message);
    return { name: 'nexurejs', version: '0.0.0' };
  }
}

/**
 * Build TypeScript code
 */
async function buildTypeScript() {
  printSectionHeader('Building TypeScript');

  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'build:ts'], {
      stdio: 'inherit',
      cwd: rootDir,
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`${Colors.GREEN}✓ TypeScript build successful${Colors.RESET}`);
        resolve(true);
      } else {
        console.error(`${Colors.RED}✗ TypeScript build failed with code ${code}${Colors.RESET}`);
        resolve(false);
      }
    });
  });
}

/**
 * Build native module for the current platform
 */
async function buildCurrentPlatform(options = {}) {
  const { forceRebuild = false, skipTests = false, verbose = false } = options;

  // Call our direct implementation instead of the separate script
  const buildSuccess = await buildNativeModuleDirect({ forceRebuild, verbose });

  if (!buildSuccess) {
    return false;
  }

  // Test the module if build was successful
  const testSuccess = await testNativeModule({ skipTests, verbose });

  return testSuccess || skipTests;
}

/**
 * Package native module for the current platform
 */
async function packageCurrentPlatform(options = {}) {
  const { verbose = false } = options;

  // Call our direct implementation instead of the separate script
  return await packageNativeModuleDirect({ verbose });
}

/**
 * Create build instructions for other platforms
 */
function createBuildInstructions() {
  printSectionHeader('Build Instructions for Other Platforms');

  // Create directory for build scripts if it doesn't exist
  const buildScriptsDir = path.join(rootDir, 'build-scripts');
  if (!fs.existsSync(buildScriptsDir)) {
    fs.mkdirSync(buildScriptsDir, { recursive: true });
  }

  const packageInfo = getPackageInfo();
  const { name, version } = packageInfo;

  SUPPORTED_PLATFORMS.forEach(({ platform: plat, arch: architecture, name: platformName }) => {
    // Skip current platform as we've already built it
    if (plat === CURRENT_PLATFORM && architecture === CURRENT_ARCH) {
      console.log(`${Colors.YELLOW}Skipping ${platformName} (current platform)${Colors.RESET}`);
      return;
    }

    console.log(`${Colors.BLUE}Generating build script for ${platformName}...${Colors.RESET}`);

    const scriptName = `build-${plat}-${architecture}.sh`;
    const scriptPath = path.join(buildScriptsDir, scriptName);

    let scriptContent;

    if (plat === 'win32') {
      // Windows batch file instead of shell script
      scriptContent = `@echo off
echo Building ${name} v${version} native module for ${platformName}
call npm install
call npm run build:ts
call node scripts/build-all-platforms.js --force
call node scripts/build-all-platforms.js --pack-only
echo Build complete for ${platformName}
`;
    } else {
      // Shell script for Unix-like systems
      scriptContent = `#!/bin/bash
echo "Building ${name} v${version} native module for ${platformName}"
npm install
npm run build:ts
node scripts/build-all-platforms.js --force
node scripts/build-all-platforms.js --pack-only
echo "Build complete for ${platformName}"
`;
    }

    fs.writeFileSync(scriptPath, scriptContent);
    console.log(`${Colors.GREEN}✓ Created ${scriptPath}${Colors.RESET}`);

    // Make the script executable on Unix-like systems
    if (CURRENT_PLATFORM !== 'win32') {
      try {
        fs.chmodSync(scriptPath, 0o755);
      } catch (err) {
        console.error(`${Colors.RED}Failed to make script executable:${Colors.RESET}`, err.message);
      }
    }
  });

  console.log(`\n${Colors.BLUE}To build on other platforms:${Colors.RESET}`);
  console.log(`${Colors.CYAN}1. Copy the entire codebase to the target platform${Colors.RESET}`);
  console.log(`${Colors.CYAN}2. Run the appropriate build script from the build-scripts directory${Colors.RESET}`);
  console.log(`${Colors.CYAN}3. Collect the generated package from the packages directory${Colors.RESET}`);
}

/**
 * Clean build directories
 */
async function cleanBuildDirectories() {
  printSectionHeader('Cleaning Build Directories');

  const directoriesToClean = [
    buildDir,
    path.join(rootDir, 'build'),
    path.join(rootDir, 'node_modules', '.cache')
  ];

  // Also clean platform-specific build folders
  SUPPORTED_PLATFORMS.forEach(({ platform: plat, arch: architecture }) => {
    directoriesToClean.push(path.join(rootDir, `build-${plat}-${architecture}`));
  });

  let success = true;

  for (const dir of directoriesToClean) {
    try {
      if (fs.existsSync(dir)) {
        console.log(`${Colors.BLUE}Cleaning directory: ${dir}${Colors.RESET}`);
        await fsPromises.rm(dir, { recursive: true, force: true });
        console.log(`${Colors.GREEN}✓ Successfully cleaned: ${dir}${Colors.RESET}`);
      }
    } catch (err) {
      console.error(`${Colors.RED}Failed to clean directory ${dir}:${Colors.RESET}`, err.message);
      success = false;
    }
  }

  // Also attempt to clear any node-gyp cache
  try {
    console.log(`${Colors.BLUE}Running node-gyp clean...${Colors.RESET}`);
    execSync('node-gyp clean', { cwd: rootDir, stdio: 'ignore' });
  } catch (err) {
    // Ignore node-gyp errors as it might not be available
    console.log(`${Colors.YELLOW}Note: node-gyp clean failed (this is usually ok)${Colors.RESET}`);
  }

  if (success) {
    console.log(`${Colors.GREEN}✓ All build directories cleaned successfully${Colors.RESET}`);
  } else {
    console.warn(`${Colors.YELLOW}Some directories could not be cleaned${Colors.RESET}`);
  }

  return success;
}

/**
 * Run ESLint with --fix option to automatically fix linting issues
 */
async function runLintFix() {
  printSectionHeader('Running ESLint Fixes');

  return new Promise((resolve) => {
    console.log(`${Colors.BLUE}Running ESLint with --fix option...${Colors.RESET}`);

    const child = spawn('npx', ['eslint', '.', '--ext', '.ts', '--fix'], {
      stdio: 'inherit',
      cwd: rootDir,
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`${Colors.GREEN}✓ ESLint fixes applied successfully${Colors.RESET}`);
        resolve(true);
      } else {
        console.error(`${Colors.RED}✗ ESLint fixes had some issues (code ${code})${Colors.RESET}`);
        console.log(`${Colors.YELLOW}You may need to manually fix some linting issues${Colors.RESET}`);
        resolve(false);
      }
    });
  });
}

/**
 * Fix unused variables in TypeScript code
 * This runs a special ESLint rule to remove unused variables
 */
async function fixUnusedVars() {
  printSectionHeader('Fixing Unused Variables');

  // First check if eslint is available
  try {
    execSync('npx eslint --version', { stdio: 'ignore' });
  } catch (err) {
    console.error(`${Colors.RED}ESLint is not available. Make sure it's installed.${Colors.RESET}`);
    return false;
  }

  return new Promise((resolve) => {
    console.log(`${Colors.BLUE}Finding and fixing unused variables...${Colors.RESET}`);

    // Run ESLint with the specific rule for unused vars
    const child = spawn(
      'npx',
      [
        'eslint',
        '.',
        '--ext',
        '.ts',
        '--fix',
        '--rule',
        '@typescript-eslint/no-unused-vars: error',
        '--rule',
        'no-unused-vars: error'
      ],
      {
        stdio: 'inherit',
        cwd: rootDir,
        shell: true
      }
    );

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`${Colors.GREEN}✓ Unused variables fixed successfully${Colors.RESET}`);
        resolve(true);
      } else {
        console.error(`${Colors.RED}✗ Fixing unused variables had some issues (code ${code})${Colors.RESET}`);
        console.log(`${Colors.YELLOW}You may need to manually fix some unused variables${Colors.RESET}`);
        resolve(false);
      }
    });
  });
}

/**
 * Check if Docker is available for cross-platform builds
 */
function checkDockerBuilds() {
  printSectionHeader('Checking Docker for Cross-Platform Builds');

  if (dockerAvailable) {
    console.log(`${Colors.GREEN}✓ Docker is available for cross-platform builds${Colors.RESET}`);

    // Create docker-builds directory if it doesn't exist
    const dockerBuildsDir = path.join(rootDir, 'docker-builds');
    if (!fs.existsSync(dockerBuildsDir)) {
      fs.mkdirSync(dockerBuildsDir, { recursive: true });
    }

    // Generate Docker scripts for Linux builds
    const linuxDockerfile = path.join(dockerBuildsDir, 'Dockerfile.linux-x64');
    const linuxBuildScript = path.join(dockerBuildsDir, 'build-linux-x64.sh');

    // Create Dockerfile for Linux builds
    const dockerfileContent = `FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \\
    python3 \\
    make \\
    g++ \\
    pkg-config \\
    git \\
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm install
RUN node scripts/build.js --force
RUN node scripts/build.js --pack-only

CMD ["bash"]
`;

    fs.writeFileSync(linuxDockerfile, dockerfileContent);
    console.log(`${Colors.GREEN}✓ Created Dockerfile for Linux builds${Colors.RESET}`);

    // Create build script for Linux
    const buildScriptContent = `#!/bin/bash
cd "$(dirname "$0")/.."
IMAGE_NAME="nexurejs-linux-x64-builder"
CONTAINER_NAME="nexurejs-linux-x64-builder"

echo "Building Docker image for Linux x64..."
docker build -t $IMAGE_NAME -f docker-builds/Dockerfile.linux-x64 .

echo "Running build in Docker container..."
docker run --name $CONTAINER_NAME $IMAGE_NAME

echo "Copying build artifacts from container..."
docker cp $CONTAINER_NAME:/app/packages ./

echo "Cleaning up Docker container..."
docker rm $CONTAINER_NAME

echo "Linux x64 build complete!"
`;

    fs.writeFileSync(linuxBuildScript, buildScriptContent);
    fs.chmodSync(linuxBuildScript, 0o755); // Make executable
    console.log(`${Colors.GREEN}✓ Created Docker build script for Linux${Colors.RESET}`);

    return true;
  } else {
    console.log(`${Colors.YELLOW}Docker is not available. Cross-platform builds will be manual.${Colors.RESET}`);
    console.log(`${Colors.YELLOW}You can install Docker to enable automated cross-platform builds.${Colors.RESET}`);
    return false;
  }
}

/**
 * Generate GitHub Actions workflow files for CI/CD
 */
function generateCIWorkflows() {
  printSectionHeader('Generating GitHub Actions Workflows');

  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  // Generate the build workflow file
  const buildWorkflowPath = path.join(workflowsDir, 'build.yml');
  const buildWorkflowContent = `name: Build

on:
  push:
    branches: [ main, master, develop ]
  pull_request:
    branches: [ main, master, develop ]

jobs:
  build:
    name: Build on \${{ matrix.os }}
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build TypeScript
      run: npm run build:ts

    - name: Build native modules
      run: node scripts/build.js --force

    - name: Run tests
      run: npm test

    - name: Package native modules
      run: node scripts/build.js --pack-only

    - name: Upload artifacts
      uses: actions/upload-artifact@v4
      with:
        name: nexurejs-\${{ matrix.os }}-node\${{ matrix.node-version }}
        path: packages/
`;

  fs.writeFileSync(buildWorkflowPath, buildWorkflowContent);
  console.log(`${Colors.GREEN}✓ Created GitHub Actions build workflow${Colors.RESET}`);

  // Generate the release workflow file
  const releaseWorkflowPath = path.join(workflowsDir, 'release.yml');
  const releaseWorkflowContent = `name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-release:
    name: Build and Release
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [20.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        registry-url: 'https://registry.npmjs.org'

    - name: Install dependencies
      run: npm ci

    - name: Build TypeScript
      run: npm run build:ts

    - name: Build native modules
      run: node scripts/build.js --force

    - name: Package native modules
      run: node scripts/build.js --pack-only

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: nexurejs-\${{ matrix.os }}-node\${{ matrix.node-version }}
        path: packages/

    - name: Create GitHub Release
      if: matrix.os == 'ubuntu-latest'
      uses: softprops/action-gh-release@v1
      with:
        files: packages/*

    - name: Publish to NPM
      if: matrix.os == 'ubuntu-latest'
      run: npm publish
      env:
        NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;

  fs.writeFileSync(releaseWorkflowPath, releaseWorkflowContent);
  console.log(`${Colors.GREEN}✓ Created GitHub Actions release workflow${Colors.RESET}`);

  // Generate the benchmark workflow file
  const benchmarkWorkflowPath = path.join(workflowsDir, 'benchmark.yml');
  const benchmarkWorkflowContent = `name: Performance Benchmark

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  benchmark:
    name: Run benchmarks
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js 20.x
      uses: actions/setup-node@v3
      with:
        node-version: 20.x
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Run benchmarks
      run: npm run benchmark

    - name: Store benchmark results
      uses: actions/upload-artifact@v4
      with:
        name: benchmark-results
        path: benchmark-results/
`;

  fs.writeFileSync(benchmarkWorkflowPath, benchmarkWorkflowContent);
  console.log(`${Colors.GREEN}✓ Created GitHub Actions benchmark workflow${Colors.RESET}`);

  return true;
}

/**
 * Fix TypeScript import paths
 * This ensures ESM compatibility by adding .js extensions to relative imports
 */
async function fixImports() {
  printSectionHeader('Fixing Import Paths');

  try {
    console.log(`${Colors.BLUE}Phase 1: Fixing ESM imports...${Colors.RESET}`);

    // Run basic imports fixup
    await fixBasicImports();

    // Fix directory imports
    await fixDirectoryImports();

    // Fix .d.ts file imports
    await fixTypesImports();

    console.log(`${Colors.GREEN}✓ All imports fixed successfully${Colors.RESET}`);
    return true;
  } catch (err) {
    console.error(`${Colors.RED}An error occurred while fixing imports:${Colors.RESET}`, err.message);
    return false;
  }
}

/**
 * Fix basic ESM imports (add .js extensions)
 */
async function fixBasicImports() {
  // Files to skip (e.g., declaration files, test files)
  const skipPatterns = [
    /\.d\.ts$/,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /\/test\//,
    /\/tests\//,
    /\/node_modules\//
  ];

  let fixedFiles = 0;
  let modifiedImports = 0;
  const errors = [];

  // RegExp patterns for finding imports
  const importPatterns = [
    // Local imports (same directory)
    {
      pattern: /from\s+['"]\.\/([^'"]+)['"]/g,
      replacement: (match, p1) => {
        // Skip if already has extension
        if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.endsWith('.json')) {
          return match;
        }
        // Check if p1 is a directory or file without extension
        if (!p1.includes('/')) {
          return `from './${p1}.js'`;
        } else {
          // If it's a path that might be a directory
          if (p1.includes('/') && !p1.split('/').pop().includes('.')) {
            return `from './${p1}/index.js'`;
          }
          return `from './${p1}.js'`;
        }
      }
    },
    // Parent directory imports
    {
      pattern: /from\s+['"]\.\.\/([^'"]+)['"]/g,
      replacement: (match, p1) => {
        // Skip if already has extension
        if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.endsWith('.json')) {
          return match;
        }
        // Check if p1 is a directory or file without extension
        if (!p1.includes('/')) {
          return `from '../${p1}/index.js'`;
        } else {
          // If it's a path that might be a directory
          if (p1.includes('/') && !p1.split('/').pop().includes('.')) {
            return `from '../${p1}/index.js'`;
          }
          return `from '../${p1}.js'`;
        }
      }
    },
    // Parent's parent directory imports
    {
      pattern: /from\s+['"]\.\.\/\.\.\/([^'"]+)['"]/g,
      replacement: (match, p1) => {
        // Skip if already has extension
        if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.endsWith('.json')) {
          return match;
        }
        // Check if p1 is a directory or file without extension
        if (!p1.includes('/')) {
          return `from '../../${p1}/index.js'`;
        } else {
          // If it's a path that might be a directory
          if (p1.includes('/') && !p1.split('/').pop().includes('.')) {
            return `from '../../${p1}/index.js'`;
          }
          return `from '../../${p1}.js'`;
        }
      }
    }
  ];

  /**
   * Check if the path should be skipped
   */
  function shouldSkip(filePath) {
    return skipPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if path is a directory
   */
  function isDirectory(filePath) {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const fullPath = path.join(dir, basename);

    try {
      return fs.statSync(fullPath).isDirectory();
    } catch (err) {
      try {
        // Check if it's a potential directory by looking for an index.ts file
        return fs.existsSync(path.join(fullPath, 'index.ts'));
      } catch (err) {
        return false;
      }
    }
  }

  /**
   * Fix imports in the given file
   */
  function fixImportsInFile(filePath) {
    try {
      // Skip files that match skip patterns
      if (shouldSkip(filePath)) {
        return false;
      }

      // Read file content
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      let fileModified = false;

      // Also handle dynamic imports
      const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      content = content.replace(dynamicImportPattern, (match, p1) => {
        if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.includes('http')) {
          return match;
        }

        // Determine if it's likely a directory or file
        let importPath = p1;
        const baseDir = path.dirname(filePath);
        let resolvedPath;

        if (p1.startsWith('./')) {
          resolvedPath = path.resolve(baseDir, p1.slice(2));
        } else if (p1.startsWith('../')) {
          resolvedPath = path.resolve(baseDir, p1);
        } else {
          // Absolute path likely, don't modify
          return match;
        }

        // Check if it's a directory
        if (isDirectory(resolvedPath)) {
          importPath = `${p1}/index.js`.replace(/\/+/g, '/');
        } else {
          importPath = `${p1}.js`;
        }

        return `import('${importPath}')`;
      });

      // Apply each pattern
      for (const { pattern, replacement } of importPatterns) {
        // Skip if the import already has .js extension
        const safePattern = new RegExp(pattern.source.replace(/\[\^\\'"\]\+/g, '[^\'"]+(?!\\.js)'), pattern.flags);
        content = content.replace(safePattern, replacement);
      }

      // Check if content was modified
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        const changes = content.split('\n').filter(
          (line, i) => line !== originalContent.split('\n')[i] &&
                      (line.includes('import') || line.includes('export'))
        ).length;

        modifiedImports += changes;
        fileModified = true;
        fixedFiles++;

        const relativePath = path.relative(rootDir, filePath);
        console.log(`${Colors.GREEN}Fixed${Colors.RESET} ${relativePath} (${changes} imports)`);
      }

      return fileModified;
    } catch (err) {
      errors.push({ file: filePath, error: err.message });
      console.error(`${Colors.RED}Error${Colors.RESET} processing ${filePath}: ${err.message}`);
      return false;
    }
  }

  /**
   * Process all TypeScript files in a directory recursively
   */
  function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        processDirectory(filePath);
      } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        fixImportsInFile(filePath);
      }
    }
  }

  const startTime = performance.now();
  processDirectory(srcDir);
  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(3);

  console.log(`\n${Colors.CYAN}Basic Imports Summary:${Colors.RESET}`);
  console.log(`${Colors.GREEN}Modified ${fixedFiles} files${Colors.RESET}`);
  console.log(`${Colors.GREEN}Fixed ${modifiedImports} imports${Colors.RESET}`);
  console.log(`${Colors.CYAN}Completed in ${duration}s${Colors.RESET}`);

  return { fixedFiles, modifiedImports, errors, duration };
}

/**
 * Fix directory imports (add /index.js to known directory modules)
 */
async function fixDirectoryImports() {
  let fixedFiles = 0;
  let modifiedImports = 0;
  const errors = [];

  // Files to skip
  const skipPatterns = [
    /\.d\.ts$/,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /\/test\//,
    /\/tests\//,
    /\/node_modules\//
  ];

  // Known directories that should be treated as modules
  const knownDirectories = [
    'types',
    'utils',
    'http',
    'middleware',
    'routing',
    'di',
    'cache',
    'validation',
    'serialization',
    'errors',
    'core',
    'decorators',
    'security',
    'native',
    'concurrency'
  ];

  /**
   * Check if the path should be skipped
   */
  function shouldSkip(filePath) {
    return skipPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if a path is likely a directory module
   */
  function isLikelyDirectoryModule(importPath) {
    const parts = importPath.split('/');
    const lastPart = parts[parts.length - 1];

    // If it contains a dot, it's likely a file
    if (lastPart.includes('.')) {
      return false;
    }

    // Check against known directory modules
    return knownDirectories.includes(lastPart);
  }

  /**
   * Fix imports in the given file
   */
  function fixImportsInFile(filePath) {
    try {
      // Skip files that match skip patterns
      if (shouldSkip(filePath)) {
        return false;
      }

      // Read file content
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      let fileModified = false;

      // Fix static imports
      const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
      content = content.replace(importRegex, (match, importPath) => {
        // Handle .js imports that should point to index.js
        if (importPath.endsWith('.js')) {
          const basePath = importPath.substring(0, importPath.length - 3);
          if (isLikelyDirectoryModule(basePath)) {
            return match.replace(`"${importPath}"`, `"${basePath}/index.js"`);
          }
          return match;
        }

        if (importPath.includes('http') || !importPath.startsWith('.')) {
          return match;
        }

        if (isLikelyDirectoryModule(importPath)) {
          // Replace with index.js
          const newImport = match.replace(`"${importPath}"`, `"${importPath}/index.js"`);
          return newImport;
        }

        return match;
      });

      // Fix dynamic imports
      const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
      content = content.replace(dynamicImportRegex, (match, importPath) => {
        // Handle .js imports that should point to index.js
        if (importPath.endsWith('.js')) {
          const basePath = importPath.substring(0, importPath.length - 3);
          if (isLikelyDirectoryModule(basePath)) {
            return match.replace(`"${importPath}"`, `"${basePath}/index.js"`);
          }
          return match;
        }

        if (importPath.includes('http') || !importPath.startsWith('.')) {
          return match;
        }

        if (isLikelyDirectoryModule(importPath)) {
          // Replace with index.js
          const newImport = match.replace(`"${importPath}"`, `"${importPath}/index.js"`);
          return newImport;
        }

        return match;
      });

      // Check if content was modified
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        const changes = content.split('\n').filter(
          (line, i) => line !== originalContent.split('\n')[i] &&
                      (line.includes('import') || line.includes('export'))
        ).length;

        modifiedImports += changes;
        fileModified = true;
        fixedFiles++;

        const relativePath = path.relative(rootDir, filePath);
        console.log(`${Colors.GREEN}Fixed${Colors.RESET} ${relativePath} (${changes} imports)`);
      }

      return fileModified;
    } catch (err) {
      errors.push({ file: filePath, error: err.message });
      console.error(`${Colors.RED}Error${Colors.RESET} processing ${filePath}: ${err.message}`);
      return false;
    }
  }

  /**
   * Process all TypeScript files in a directory recursively
   */
  function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        processDirectory(filePath);
      } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        fixImportsInFile(filePath);
      }
    }
  }

  const startTime = performance.now();
  processDirectory(srcDir);
  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(3);

  console.log(`\n${Colors.CYAN}Directory Imports Summary:${Colors.RESET}`);
  console.log(`${Colors.GREEN}Modified ${fixedFiles} files${Colors.RESET}`);
  console.log(`${Colors.GREEN}Fixed ${modifiedImports} imports${Colors.RESET}`);
  console.log(`${Colors.CYAN}Completed in ${duration}s${Colors.RESET}`);

  return { fixedFiles, modifiedImports, errors, duration };
}

/**
 * Fix types imports (from '../types.js' to '../types/index.js')
 */
async function fixTypesImports() {
  let fixedFiles = 0;
  let modifiedImports = 0;
  const errors = [];

  // Modules that need to be fixed (import from 'x.js' -> import from 'x/index.js')
  const modulesToFix = [
    'types',
    'utils',
    'http',
    'middleware',
    'routing',
    'cache',
    'validation',
    'security',
    'errors',
    'core',
    'decorators',
    'di',
    'native',
    'concurrency',
    'serialization'
  ];

  /**
   * Fix imports in a file
   */
  function fixImportsInFile(filePath) {
    try {
      // Read file content
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      let fileModified = false;

      // Create a pattern to match directory imports with .js extension
      const modulePattern = modulesToFix.map(module =>
        `\\.\\.\\/(?:\\.\\.\\/)*${module}\\.js`
      ).join('|');

      const importRegex = new RegExp(`(from\\s+['"](${modulePattern})['"])`, 'g');

      content = content.replace(importRegex, (match, _, importPath) => {
        const basePath = importPath.replace(/\.js$/, '');
        return match.replace(`"${importPath}"`, `"${basePath}/index.js"`);
      });

      // Handle dynamic imports too
      const dynamicImportRegex = new RegExp(`(import\\s*\\(\\s*['"](${modulePattern})['"]\\s*\\))`, 'g');

      content = content.replace(dynamicImportRegex, (match, _, importPath) => {
        const basePath = importPath.replace(/\.js$/, '');
        return match.replace(`"${importPath}"`, `"${basePath}/index.js"`);
      });

      // Check if content was modified
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        const changes = content.split('\n').filter(
          (line, i) => line !== originalContent.split('\n')[i] &&
                      (line.includes('import') || line.includes('export'))
        ).length;

        modifiedImports += changes;
        fixedFiles++;

        const relativePath = path.relative(rootDir, filePath);
        console.log(`${Colors.GREEN}Fixed${Colors.RESET} ${relativePath} (${changes} imports)`);
      }

      return content !== originalContent;
    } catch (err) {
      errors.push({ file: filePath, error: err.message });
      console.error(`${Colors.RED}Error${Colors.RESET} processing ${filePath}: ${err.message}`);
      return false;
    }
  }

  /**
   * Process all TypeScript files in a directory recursively
   */
  function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        processDirectory(filePath);
      } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        fixImportsInFile(filePath);
      }
    }
  }

  const startTime = performance.now();
  processDirectory(srcDir);
  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(3);

  console.log(`\n${Colors.CYAN}Types Imports Summary:${Colors.RESET}`);
  console.log(`${Colors.GREEN}Modified ${fixedFiles} files${Colors.RESET}`);
  console.log(`${Colors.GREEN}Fixed ${modifiedImports} imports${Colors.RESET}`);
  console.log(`${Colors.CYAN}Completed in ${duration}s${Colors.RESET}`);

  return { fixedFiles, modifiedImports, errors, duration };
}

/**
 * Direct implementation of building native modules
 */
async function buildNativeModuleDirect(options = {}) {
  const { forceRebuild = false, verbose = false } = options;

  printSectionHeader('Building Native Module');

  // Check if native module build is necessary
  const nativeModulePath = path.join(buildDir, 'Release/nexurejs_native.node');
  if (!forceRebuild && fs.existsSync(nativeModulePath)) {
    console.log(`${Colors.YELLOW}Native module already exists. Use --force to rebuild.${Colors.RESET}`);
    return true;
  }

  console.log(`${Colors.BLUE}Building native module for ${CURRENT_PLATFORM}-${CURRENT_ARCH}...${Colors.RESET}`);

  // Create build directory if it doesn't exist
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Check for simdjson.h on Windows
  if (CURRENT_PLATFORM === 'win32') {
    const simdjsonHeaderPath = path.join(rootDir, 'src', 'native', 'json', 'simdjson.h');
    if (!fs.existsSync(simdjsonHeaderPath)) {
      console.log(`${Colors.YELLOW}Creating simdjson stub for Windows compatibility...${Colors.RESET}`);

      try {
        // Create simdjson directory if it doesn't exist
        const simdjsonDir = path.join(rootDir, 'src', 'native', 'json');
        fs.mkdirSync(simdjsonDir, { recursive: true });

        // Create the simdjson stub header
        // This function can be called from our preinstall script
        // but we add it here as a fallback
        const preinstallScript = path.join(rootDir, 'scripts', 'preinstall.js');
        if (fs.existsSync(preinstallScript)) {
          try {
            execSync(`node ${preinstallScript}`, { stdio: 'inherit' });
          } catch (err) {
            console.error(`${Colors.RED}Failed to run preinstall script:${Colors.RESET}`, err.message);
            return false;
          }
        } else {
          console.error(`${Colors.RED}Preinstall script not found. Build may fail.${Colors.RESET}`);
        }
      } catch (err) {
        console.error(`${Colors.RED}Failed to create simdjson stub:${Colors.RESET}`, err.message);
        return false;
      }
    }

    // Pre-sanitize any existing vcxproj files before running node-gyp
    await sanitizeVcxprojFiles();
  }

  try {
    // Run node-gyp rebuild
    console.log(`${Colors.BLUE}Running node-gyp...${Colors.RESET}`);

    const cmd = 'node-gyp';
    const args = ['rebuild'];

    if (verbose) {
      args.push('--verbose');
    }

    if (CURRENT_PLATFORM === 'win32') {
      // Add Windows-specific flags
      args.push('--msvs_version=2022');
    }

    execSync(`${cmd} ${args.join(' ')}`, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    // Sanitize vcxproj files if on Windows and try again if it failed
    if (CURRENT_PLATFORM === 'win32') {
      await sanitizeVcxprojFiles();

      // Try to build again if vcxproj files were sanitized
      try {
        execSync(`${cmd} ${args.join(' ')}`, {
          cwd: rootDir,
          stdio: 'inherit',
          env: { ...process.env, FORCE_COLOR: '1' }
        });
      } catch (retryErr) {
        // If it still fails, continue with the original error handling
        throw retryErr;
      }
    }

    console.log(`${Colors.GREEN}✓ Native module build successful${Colors.RESET}`);

    // Copy the built module to the dist directory
    await copyNativeModule();

    return true;
  } catch (err) {
    console.error(`${Colors.RED}✗ Native module build failed:${Colors.RESET}`, err.message);

    // Check if we can run in fallback mode (JS only)
    console.log(`${Colors.YELLOW}Native module build failed. Creating JS fallback...${Colors.RESET}`);

    try {
      // Create empty fallback module
      const fallbackDir = path.join(buildDir, 'Release');
      fs.mkdirSync(fallbackDir, { recursive: true });

      if (!fs.existsSync(path.join(fallbackDir, 'nexurejs_native.node'))) {
        // Create empty file as fallback
        fs.writeFileSync(path.join(fallbackDir, 'nexurejs_native.node'), Buffer.alloc(0));
      }

      // Create file to indicate this is a fallback
      fs.writeFileSync(path.join(buildDir, '.js_fallback'), JSON.stringify({
        platform: CURRENT_PLATFORM,
        arch: CURRENT_ARCH,
        timestamp: new Date().toISOString(),
        reason: err.message
      }, null, 2));

      console.log(`${Colors.YELLOW}Created JS fallback. Native features will be disabled.${Colors.RESET}`);

      // Copy the fallback module to the dist directory
      await copyNativeModule();

      return true;
    } catch (fallbackErr) {
      console.error(`${Colors.RED}Failed to create fallback:${Colors.RESET}`, fallbackErr.message);
      return false;
    }
  }
}

/**
 * Test if the native module can be loaded
 */
async function testNativeModule(options = {}) {
  const { skipTests = false, verbose = false } = options;

  if (skipTests) {
    console.log(`${Colors.YELLOW}Skipping tests as requested${Colors.RESET}`);
    return true;
  }

  printSectionHeader('Testing Native Module');

  // Path to the built module
  const buildPath = path.join(rootDir, 'build', 'Release');
  const modulePath = path.join(buildPath, 'nexurejs_native.node');

  if (!fs.existsSync(modulePath)) {
    console.error(`${Colors.RED}Native module not found at ${modulePath}${Colors.RESET}`);
    return false;
  }

  try {
    // Attempt to load in a separate process to avoid crashing this one
    const testCode = `
      try {
        const native = require('${modulePath.replace(/\\/g, '\\\\')}');
        console.log('MODULE_VERSION=' + native.version);
        process.exit(0);
      } catch(e) {
        console.error(e);
        process.exit(1);
      }
    `;

    const result = execSync(`node -e "${testCode}"`, { encoding: 'utf8' });

    const versionMatch = result.match(/MODULE_VERSION=(.+)/);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      console.log(`${Colors.GREEN}✓ Native module loaded and verified: version ${version}${Colors.RESET}`);
      return true;
    }

    console.warn(`${Colors.YELLOW}Module loaded but version not found${Colors.RESET}`);
    return false;
  } catch (error) {
    console.error(`${Colors.RED}Error loading native module:${Colors.RESET}`, error.message);
    if (verbose) {
      console.error(error);
    }
    return false;
  }
}

/**
 * Create a package for distribution
 */
async function packageNativeModuleDirect(options = {}) {
  const { verbose = false } = options;

  printSectionHeader(`Creating Package for ${CURRENT_PLATFORM}-${CURRENT_ARCH}`);

  try {
    const packageName = `nexurejs-native-${CURRENT_PLATFORM}-${CURRENT_ARCH}`;
    const packageDir = path.join(rootDir, 'prebuilds');
    const targetDir = path.join(packageDir, `${CURRENT_PLATFORM}-${CURRENT_ARCH}`);

    // Create directories
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir, { recursive: true });
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy the built module
    const modulePath = path.join(rootDir, 'build', 'Release', 'nexurejs_native.node');
    const targetPath = path.join(targetDir, 'nexurejs_native.node');

    fs.copyFileSync(modulePath, targetPath);

    // Create a package.json for the prebuilt
    const packageJson = {
      name: packageName,
      version: '0.1.0',
      description: `Prebuilt NexureJS native module for ${CURRENT_PLATFORM}-${CURRENT_ARCH}`,
      os: [CURRENT_PLATFORM],
      cpu: [CURRENT_ARCH],
      main: 'nexurejs_native.node',
      files: ['nexurejs_native.node'],
      engines: {
        node: '>=16.0.0'
      }
    };

    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create a directory for final npm packages if it doesn't exist
    if (!fs.existsSync(packagesDir)) {
      fs.mkdirSync(packagesDir, { recursive: true });
    }

    // Create a tarball for the package
    const outputDir = path.join(rootDir, 'packages');
    const tarballName = `${packageName}-0.1.0.tgz`;

    // Create tarball using npm pack
    execSync(`cd ${targetDir} && npm pack && mv ${packageName}-0.1.0.tgz ${path.join(outputDir, tarballName)}`, {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: rootDir
    });

    console.log(`${Colors.GREEN}✓ Package created at ${path.join(outputDir, tarballName)}${Colors.RESET}`);
    return true;
  } catch (error) {
    console.error(`${Colors.RED}Error creating package:${Colors.RESET}`, error.message);
    if (verbose) {
      console.error(error);
    }
    return false;
  }
}

/**
 * Run all fix tasks in sequence
 */
async function runAllFixes() {
  printSectionHeader('Running All Code Fixes');

  const lintFixSuccess = await runLintFix();
  if (!lintFixSuccess) {
    console.warn(`${Colors.YELLOW}ESLint fixes had issues but continuing...${Colors.RESET}`);
  }

  const unusedVarsSuccess = await fixUnusedVars();
  if (!unusedVarsSuccess) {
    console.warn(`${Colors.YELLOW}Unused variables fixes had issues but continuing...${Colors.RESET}`);
  }

  const importsSuccess = await fixImports();
  if (!importsSuccess) {
    console.warn(`${Colors.YELLOW}Import fixes had issues but continuing...${Colors.RESET}`);
  }

  return lintFixSuccess && unusedVarsSuccess && importsSuccess;
}

/**
 * Run the unified build process
 */
async function runUnifiedBuild(options = {}) {
  const startTime = performance.now();
  printSectionHeader('Running Unified Build Process');

  // Track overall build status
  let buildStatus = {
    cleaned: false,
    lintFixed: false,
    unusedVarsFixed: false,
    typescript: false,
    imports: false,
    current: false,
    docker: false,
    scriptsCreated: false,
    ciCreated: false
  };

  try {
    // 0. Clean build directories
    console.log(`${Colors.CYAN}Step 0: Cleaning build directories...${Colors.RESET}`);
    buildStatus.cleaned = await cleanBuildDirectories();

    // Continue even if cleaning fails
    if (!buildStatus.cleaned) {
      console.warn(`${Colors.YELLOW}Warning: Cleaning failed, but continuing with build${Colors.RESET}`);
    }

    // 1. Run ESLint fixes
    if (!options.skipLint) {
      console.log(`${Colors.CYAN}Step 1: Running ESLint fixes...${Colors.RESET}`);
      buildStatus.lintFixed = await runLintFix();

      if (!buildStatus.lintFixed) {
        console.warn(`${Colors.YELLOW}Warning: ESLint fixes had issues but continuing...${Colors.RESET}`);
      }
    }

    // 1.5. Fix unused variables
    if (!options.skipUnusedVars) {
      console.log(`${Colors.CYAN}Step 1.5: Fixing unused variables...${Colors.RESET}`);
      buildStatus.unusedVarsFixed = await fixUnusedVars();

      if (!buildStatus.unusedVarsFixed) {
        console.warn(`${Colors.YELLOW}Warning: Unused variables fixes had issues but continuing...${Colors.RESET}`);
      }
    }

    // 2. Build TypeScript
    console.log(`${Colors.CYAN}Step 2: Building TypeScript...${Colors.RESET}`);
    buildStatus.typescript = await buildTypeScript();

    if (!buildStatus.typescript) {
      throw new Error('TypeScript build failed');
    }

    // 3. Fix imports
    console.log(`${Colors.CYAN}Step 3: Fixing import paths...${Colors.RESET}`);
    buildStatus.imports = await fixImports();

    if (!buildStatus.imports) {
      console.warn(`${Colors.YELLOW}Warning: Import fixes failed or were incomplete, but continuing with build${Colors.RESET}`);
    }

    // 4. Build for current platform
    console.log(`${Colors.CYAN}Step 4: Building native modules for current platform...${Colors.RESET}`);
    buildStatus.current = await buildCurrentPlatform({
      forceRebuild: options.forceRebuild,
      skipTests: options.skipTests,
      verbose: options.verbose
    });

    if (buildStatus.current) {
      await packageCurrentPlatform({ verbose: options.verbose });
    } else {
      console.warn(`${Colors.YELLOW}Warning: Current platform build failed, but continuing with other steps${Colors.RESET}`);
    }

    // 5. Create build instructions for other platforms
    console.log(`${Colors.CYAN}Step 5: Creating build scripts for other platforms...${Colors.RESET}`);
    createBuildInstructions();
    buildStatus.scriptsCreated = true;

    // 6. Check Docker and build for Linux if available
    if (!options.skipDocker) {
      console.log(`${Colors.CYAN}Step 6: Checking Docker availability...${Colors.RESET}`);
      buildStatus.docker = checkDockerBuilds();

      if (buildStatus.docker && CURRENT_PLATFORM !== 'linux' && !options.skipDockerBuild) {
        console.log(`${Colors.CYAN}Building for Linux using Docker...${Colors.RESET}`);
        try {
          const dockerBuildScript = path.join(rootDir, 'docker-builds', 'build-linux-x64.sh');
          if (fs.existsSync(dockerBuildScript)) {
            execSync(`bash ${dockerBuildScript}`, { stdio: 'inherit', cwd: rootDir });
            console.log(`${Colors.GREEN}✓ Docker Linux build completed${Colors.RESET}`);
          }
        } catch (err) {
          console.error(`${Colors.RED}Docker build failed:${Colors.RESET}`, err.message);
        }
      }
    } else {
      console.log(`${Colors.YELLOW}Skipping Docker steps${Colors.RESET}`);
    }

    // GitHub Actions workflows (.github/workflows/ci.yml, release.yml,
    // benchmark.yml) are hand-maintained source files. They are intentionally
    // NOT generated here — a build script must not overwrite CI config.

    // Final summary
    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    printSectionHeader('Build Process Summary');
    console.log(`${Colors.BOLD}Total time:${Colors.RESET} ${duration}s`);
    console.log(`${Colors.BOLD}Clean directories:${Colors.RESET} ${buildStatus.cleaned ? `${Colors.GREEN}Success` : `${Colors.YELLOW}Skipped/Failed`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}ESLint fixes:${Colors.RESET} ${buildStatus.lintFixed ? `${Colors.GREEN}Success` : `${Colors.YELLOW}Skipped/Failed`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}Unused vars fixed:${Colors.RESET} ${buildStatus.unusedVarsFixed ? `${Colors.GREEN}Success` : `${Colors.YELLOW}Skipped/Failed`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}TypeScript build:${Colors.RESET} ${buildStatus.typescript ? `${Colors.GREEN}Success` : `${Colors.RED}Failed`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}Fix imports:${Colors.RESET} ${buildStatus.imports ? `${Colors.GREEN}Success` : `${Colors.YELLOW}Skipped/Failed`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}Current platform build:${Colors.RESET} ${buildStatus.current ? `${Colors.GREEN}Success` : `${Colors.RED}Failed`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}Build scripts created:${Colors.RESET} ${buildStatus.scriptsCreated ? `${Colors.GREEN}Yes` : `${Colors.RED}No`}${Colors.RESET}`);
    console.log(`${Colors.BOLD}Docker support:${Colors.RESET} ${buildStatus.docker ? `${Colors.GREEN}Available` : `${Colors.YELLOW}Not available`}${Colors.RESET}`);

    // All done!
    console.log(`\n${Colors.GREEN}${Colors.BOLD}Unified build process completed!${Colors.RESET}`);
    return true;
  } catch (err) {
    console.error(`${Colors.RED}Unified build process failed:${Colors.RESET}`, err.message);
    return false;
  }
}

/**
 * Create a unified build script for the current platform
 * This creates a standalone JS file that can be used to build on this platform
 */
function createUnifiedBuildScript() {
  printSectionHeader('Creating Unified Build Script');

  // Create the scripts directory if it doesn't exist
  const standaloneDir = path.join(rootDir, 'standalone');
  if (!fs.existsSync(standaloneDir)) {
    fs.mkdirSync(standaloneDir, { recursive: true });
  }

  // Get current platform and architecture
  const currentPlatform = platform();
  const currentArch = arch();
  const scriptName = `build-${currentPlatform}-${currentArch}.js`;
  const scriptPath = path.join(standaloneDir, scriptName);

  console.log(`${Colors.BLUE}Creating unified build script for ${currentPlatform}-${currentArch}...${Colors.RESET}`);

  // Read the current file (this file)
  const currentScript = fs.readFileSync(__filename, 'utf8');

  // Add a header to the script
  const header = `/**
 * Unified Build Script for NexureJS
 * Platform: ${currentPlatform}-${currentArch}
 * Generated: ${new Date().toISOString()}
 *
 * This is a standalone build script that can be used to build NexureJS on this platform.
 * It contains all the functionality of the original build script but packaged into a single file.
 */

`;

  // Modify the main function to automatically run with default options
  const modifiedMain = `
/**
 * Main function
 */
async function main() {
  console.log(\`\${Colors.BOLD}\${Colors.BLUE}NexureJS Unified Build Script\${Colors.RESET}\`);
  console.log(\`\${Colors.BLUE}${'='.repeat(30)}\${Colors.RESET}\\n\`);

  // Get package info
  const packageInfo = getPackageInfo();
  console.log(\`\${Colors.BOLD}Package:\${Colors.RESET} \${packageInfo.name} v\${packageInfo.version}\`);
  console.log(\`\${Colors.BOLD}Platform:\${Colors.RESET} ${currentPlatform}-${currentArch}\`);

  // Parse command line arguments or use defaults
  const options = parseArguments();

  // Run the unified build process
  const success = await runUnifiedBuild(options);

  // Exit with appropriate code
  process.exit(success ? 0 : 1);
}

// Run the main function
main().catch(err => {
  console.error(\`\${Colors.RED}Unexpected error:\${Colors.RESET}\`, err);
  process.exit(1);
});
`;

  // Replace the original main function and the call to main
  let modifiedScript = currentScript.replace(/async function main\(\)[\s\S]+?^}/m, '');
  modifiedScript = modifiedScript.replace(/main\(\).+?;/g, '');
  modifiedScript = header + modifiedScript + modifiedMain;

  // Write the modified script to the file
  fs.writeFileSync(scriptPath, modifiedScript);
  fs.chmodSync(scriptPath, 0o755); // Make executable

  console.log(`${Colors.GREEN}✓ Created unified build script: ${scriptPath}${Colors.RESET}`);
  console.log(`${Colors.BLUE}You can run this script directly with: node ${scriptPath}${Colors.RESET}`);
}

/**
 * Main function
 */
async function main() {
  console.log(`${Colors.BOLD}${Colors.BLUE}NexureJS Native Module Build Manager${Colors.RESET}`);
  console.log(`${Colors.BLUE}${'='.repeat(36)}${Colors.RESET}\n`);

  // Get package info
  const packageInfo = getPackageInfo();
  console.log(`${Colors.BOLD}Package:${Colors.RESET} ${packageInfo.name} v${packageInfo.version}`);
  console.log(`${Colors.BOLD}Current platform:${Colors.RESET} ${CURRENT_PLATFORM}-${CURRENT_ARCH}`);

  // Create directories
  if (!fs.existsSync(packagesDir)) {
    fs.mkdirSync(packagesDir, { recursive: true });
  }

  // Parse command line arguments
  const options = parseArguments();

  // Show help if requested
  if (options.help) {
    showHelp();
    return;
  }

  if (options.createUnifiedScript) {
    // Create the unified build script
    createUnifiedBuildScript();
  } else if (options.cleanOnly) {
    // Just clean
    const cleaned = await cleanBuildDirectories();
    process.exit(cleaned ? 0 : 1);
  } else if (options.fixImportsOnly) {
    // Just fix imports
    const fixed = await fixImports();
    process.exit(fixed ? 0 : 1);
  } else if (options.fixLintOnly) {
    // Just run ESLint fixes
    const fixed = await runLintFix();
    process.exit(fixed ? 0 : 1);
  } else if (options.fixUnusedVarsOnly) {
    // Just fix unused variables
    const fixed = await fixUnusedVars();
    process.exit(fixed ? 0 : 1);
  } else if (options.fixAll) {
    // Run all code fixes
    const fixed = await runAllFixes();
    process.exit(fixed ? 0 : 1);
  } else if (options.packOnly) {
    // Just package the native module
    const packaged = await packageCurrentPlatform({ verbose: options.verbose });
    process.exit(packaged ? 0 : 1);
  } else if (options.installOnly) {
    // Just install native modules
    const installed = await installNativeModules({
      liteMode: options.liteMode,
      verbose: options.verbose
    });
    process.exit(installed ? 0 : 1);
  } else {
    // Run the unified build process by default
    const result = await runUnifiedBuild(options);

    if (!result) {
      process.exit(1);
    }
  }

  console.log(`\n${Colors.BOLD}${Colors.CYAN}Next Steps:${Colors.RESET}`);
  console.log(`${Colors.CYAN}1. Run the build scripts on their respective platforms${Colors.RESET}`);
  console.log(`${Colors.CYAN}2. Collect all packages in the packages directory${Colors.RESET}`);
  console.log(`${Colors.CYAN}3. Publish the packages to npm or use them directly${Colors.RESET}`);
  console.log(`${Colors.CYAN}4. Update package.json optionalDependencies with the new versions${Colors.RESET}`);

  console.log(`\n${Colors.GREEN}${Colors.BOLD}Build manager completed successfully!${Colors.RESET}`);
}

main().catch(err => {
  console.error(`${Colors.RED}Error:${Colors.RESET}`, err);
  process.exit(1);
});

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);

  return {
    cleanOnly: args.includes('--clean-only'),
    fixImportsOnly: args.includes('--fix-imports-only'),
    fixLintOnly: args.includes('--fix-lint-only'),
    fixUnusedVarsOnly: args.includes('--fix-unused-vars-only'),
    fixAll: args.includes('--fix-all'),
    forceRebuild: args.includes('--force'),
    skipTests: args.includes('--skip-tests'),
    skipDocker: args.includes('--skip-docker'),
    packOnly: args.includes('--pack-only'),
    installOnly: args.includes('--install-only'),
    liteMode: args.includes('--lite') || args.includes('--js-only'),
    createUnifiedScript: args.includes('--create-unified-script'),
    help: args.includes('--help') || args.includes('-h'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
}

/**
 * Display help message
 */
function showHelp() {
  console.log(`
${Colors.BOLD}${Colors.BLUE}NexureJS Build Manager - Usage${Colors.RESET}
${Colors.BLUE}==============================${Colors.RESET}

${Colors.CYAN}Basic Commands:${Colors.RESET}
  node scripts/build-all-platforms.js            Run full build process
  node scripts/build-all-platforms.js --help     Show this help message

${Colors.CYAN}Build Options:${Colors.RESET}
  --force                     Force rebuild
  --skip-tests                Skip native module tests
  --pack-only                 Only package native modules
  --install-only              Only install native modules
  --lite, --js-only           Install in lite mode (JavaScript only)
  --skip-docker               Skip Docker build steps

${Colors.CYAN}Code Fix Options:${Colors.RESET}
  --fix-all                   Run all code fixes
  --fix-lint-only             Only run ESLint fixes
  --fix-unused-vars-only      Only fix unused variables
  --fix-imports-only          Only fix import paths

${Colors.CYAN}Other Options:${Colors.RESET}
  --clean-only                Only clean build directories
  --create-unified-script     Create unified build script for current platform
  --verbose, -v               Show verbose output

${Colors.CYAN}Examples:${Colors.RESET}
  # Full build
  node scripts/build-all-platforms.js

  # Just clean directories
  node scripts/build-all-platforms.js --clean-only

  # Install native modules
  node scripts/build-all-platforms.js --install-only

  # Fix all code issues
  node scripts/build-all-platforms.js --fix-all
`);
}

/**
 * Check for required build tools
 */
async function checkBuildTools() {
  const isWindows = CURRENT_PLATFORM === 'win32';
  const isMac = CURRENT_PLATFORM === 'darwin';
  const isLinux = CURRENT_PLATFORM === 'linux';

  console.log(`${Colors.BLUE}Checking for required build tools...${Colors.RESET}`);

  // Check for node-gyp
  try {
    const gypVersion = execSync('node-gyp --version', { encoding: 'utf8' }).trim();
    console.log(`${Colors.GREEN}✅ node-gyp is installed (${gypVersion})${Colors.RESET}`);
  } catch (error) {
    console.warn(`${Colors.YELLOW}⚠️ node-gyp is not installed or not in PATH${Colors.RESET}`);
    console.log(`${Colors.YELLOW}Installing node-gyp may be required for native modules${Colors.RESET}`);

    if (isWindows) {
      console.log(`${Colors.CYAN}For Windows, run: npm install --global --production windows-build-tools${Colors.RESET}`);
      console.log(`${Colors.CYAN}Then: npm install --global node-gyp${Colors.RESET}`);
    } else if (isMac) {
      console.log(`${Colors.CYAN}For macOS, run: xcode-select --install${Colors.RESET}`);
      console.log(`${Colors.CYAN}Then: npm install --global node-gyp${Colors.RESET}`);
    } else if (isLinux) {
      console.log(`${Colors.CYAN}For Linux, run: sudo apt-get install build-essential python3${Colors.RESET}`);
      console.log(`${Colors.CYAN}Then: npm install --global node-gyp${Colors.RESET}`);
    }

    return false;
  }

  // Platform specific checks
  if (isWindows) {
    try {
      // Check for Visual Studio Build Tools
      execSync('where cl', { stdio: 'ignore' });
      console.log(`${Colors.GREEN}✅ Visual C++ Build Tools found${Colors.RESET}`);
    } catch (error) {
      console.warn(`${Colors.YELLOW}⚠️ Visual C++ Build Tools not found${Colors.RESET}`);
      console.log(`${Colors.CYAN}To install: npm install --global --production windows-build-tools${Colors.RESET}`);
      return false;
    }
  } else if (isMac) {
    try {
      // Check for XCode Command Line Tools
      execSync('xcode-select -p', { stdio: 'ignore' });
      console.log(`${Colors.GREEN}✅ XCode Command Line Tools found${Colors.RESET}`);
    } catch (error) {
      console.warn(`${Colors.YELLOW}⚠️ XCode Command Line Tools not found${Colors.RESET}`);
      console.log(`${Colors.CYAN}To install: xcode-select --install${Colors.RESET}`);
      return false;
    }
  } else if (isLinux) {
    try {
      // Check for gcc/g++
      execSync('gcc --version', { stdio: 'ignore' });
      console.log(`${Colors.GREEN}✅ GCC found${Colors.RESET}`);
    } catch (error) {
      console.warn(`${Colors.YELLOW}⚠️ GCC not found${Colors.RESET}`);
      console.log(`${Colors.CYAN}To install: sudo apt-get install build-essential${Colors.RESET}`);
      return false;
    }
  }

  return true;
}

/**
 * Download a file from a URL to a destination path
 */
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      // Check for successful response
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }

      // Pipe the response to the file
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Download and extract a tarball from a URL to a destination path
 */
async function downloadAndExtractTarball(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`${Colors.BLUE}Downloading from ${url}${Colors.RESET}`);

    // Create destination directory if it doesn't exist
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Download and extract the tarball
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadAndExtractTarball(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      // Check for successful response
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download tarball: ${response.statusCode}`));
        return;
      }

      // Extract the tarball
      response
        .pipe(createGunzip())
        .pipe(tar.extract({ cwd: destDir }))
        .on('finish', resolve)
        .on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Download prebuilt binary
 */
async function downloadPrebuilt() {
  const platformId = `${CURRENT_PLATFORM}-${CURRENT_ARCH}`;

  // Check if platform is supported
  const isSupported = SUPPORTED_PLATFORMS.some(
    p => p.platform === CURRENT_PLATFORM && p.arch === CURRENT_ARCH
  );

  if (!isSupported) {
    console.log(`${Colors.YELLOW}Unsupported platform: ${platformId}${Colors.RESET}`);
    return false;
  }

  // Get version from package.json
  const packageInfo = getPackageInfo();
  const { version } = packageInfo;

  const url = `https://github.com/nexurejs/nexurejs/releases/download/v${version}/nexurejs-native-${platformId}.tar.gz`;
  const dest = path.join(rootDir, 'build', 'Release', 'nexurejs_native.node');

  try {
    printSectionHeader(`Downloading Native Module for ${platformId}`);
    await downloadAndExtractTarball(url, dest);
    console.log(`${Colors.GREEN}✓ Prebuilt binary downloaded successfully!${Colors.RESET}`);
    return true;
  } catch (error) {
    console.log(`${Colors.YELLOW}Failed to download prebuilt binary: ${error.message}${Colors.RESET}`);
    console.log(`${Colors.YELLOW}Falling back to building from source...${Colors.RESET}`);
    return false;
  }
}

/**
 * Install in lite mode (JavaScript only)
 */
async function installLiteMode() {
  printSectionHeader('Installing in LITE Mode');
  console.log(`${Colors.BLUE}Using JavaScript implementations only (no native modules)${Colors.RESET}`);

  // Create a marker file to indicate lite mode
  const liteMarkerPath = path.join(rootDir, '.nexurejs-lite-mode');
  fs.writeFileSync(liteMarkerPath, new Date().toISOString());

  console.log(`${Colors.GREEN}✓ Lite mode installation complete${Colors.RESET}`);
  console.log(`${Colors.BLUE}Native modules are disabled, using JavaScript implementations${Colors.RESET}`);
  console.log(`${Colors.BLUE}To use native modules in the future, remove ${liteMarkerPath} file and reinstall${Colors.RESET}`);

  return true;
}

/**
 * Install native modules
 */
async function installNativeModules(options = {}) {
  const { liteMode = false, verbose = false } = options;

  printSectionHeader('NexureJS Native Module Installation');

  // If lite mode explicitly requested, skip native module installation
  if (liteMode) {
    return installLiteMode();
  }

  // Check for build tools
  const buildToolsAvailable = await checkBuildTools();

  if (!buildToolsAvailable) {
    console.log('');
    console.log(`${Colors.YELLOW}⚠️ Some build tools are missing for native module compilation${Colors.RESET}`);
    console.log(`${Colors.YELLOW}You have two options:${Colors.RESET}`);
    console.log(`${Colors.CYAN}1. Install the required build tools (recommended for best performance)${Colors.RESET}`);
    console.log(`${Colors.CYAN}2. Install in lite mode using JavaScript implementations only${Colors.RESET}`);
    console.log('');

    // In non-interactive mode (CI/CD), default to lite mode
    if (!process.stdin.isTTY) {
      console.log(`${Colors.YELLOW}Non-interactive shell detected, defaulting to lite mode installation${Colors.RESET}`);
      return installLiteMode();
    }

    // Interactive mode - ask user
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      readline.question(`${Colors.YELLOW}Install in lite mode? (y/N): ${Colors.RESET}`, (ans) => {
        readline.close();
        resolve(ans.toLowerCase());
      });
    });

    if (answer === 'y' || answer === 'yes') {
      return installLiteMode();
    } else {
      console.log(`${Colors.YELLOW}Please install the required build tools and try again${Colors.RESET}`);
      console.log(`${Colors.YELLOW}You can also run with --lite flag for lite mode: node scripts/build-all-platforms.js --install-only --lite${Colors.RESET}`);
      return false;
    }
  }

  // Continue with normal installation with native modules
  console.log(`${Colors.BLUE}Installing NexureJS with native module support...${Colors.RESET}`);

  try {
    // Try to download prebuilt binary
    const prebuiltSuccess = await downloadPrebuilt();

    // If prebuilt binary download failed, build from source
    let buildSuccess = prebuiltSuccess;
    if (!prebuiltSuccess) {
      console.log(`${Colors.YELLOW}Building native module from source...${Colors.RESET}`);
      buildSuccess = await buildNativeModuleDirect({
        forceRebuild: true,
        verbose: verbose
      });
    }

    // Test the native module
    if (buildSuccess) {
      const testSuccess = await testNativeModule({
        skipTests: false,
        verbose: verbose
      });

      if (!testSuccess) {
        console.warn(`${Colors.YELLOW}⚠️ Native module test failed, falling back to JavaScript implementation${Colors.RESET}`);

        // Create a marker file indicating native modules should be disabled
        const disableMarkerPath = path.join(rootDir, '.nexurejs-native-disabled');
        fs.writeFileSync(disableMarkerPath, new Date().toISOString());
        console.log(`${Colors.YELLOW}Created ${disableMarkerPath} marker file${Colors.RESET}`);
      } else {
        console.log(`${Colors.GREEN}✓ Native module test passed${Colors.RESET}`);
      }
    } else {
      console.warn(`${Colors.YELLOW}⚠️ Native module installation failed, falling back to JavaScript implementations${Colors.RESET}`);

      // Create a marker file indicating native modules should be disabled
      const disableMarkerPath = path.join(rootDir, '.nexurejs-native-disabled');
      fs.writeFileSync(disableMarkerPath, new Date().toISOString());
      console.log(`${Colors.YELLOW}Created ${disableMarkerPath} marker file${Colors.RESET}`);
    }

    console.log('');
    console.log(`${Colors.GREEN}✓ Installation completed successfully!${Colors.RESET}`);

    if (fs.existsSync(path.join(rootDir, '.nexurejs-native-disabled'))) {
      console.log(`${Colors.BLUE}ℹ️ Using JavaScript implementations (native modules disabled)${Colors.RESET}`);
      console.log(`${Colors.BLUE}ℹ️ To enable native modules later, remove the .nexurejs-native-disabled file and reinstall${Colors.RESET}`);
    } else {
      console.log(`${Colors.GREEN}ℹ️ Using native modules for optimal performance${Colors.RESET}`);
    }

    return true;
  } catch (err) {
    console.error(`${Colors.RED}❌ Installation failed:${Colors.RESET}`, err.message);
    return false;
  }
}

/**
 * Copy the built native module to the dist directory
 */
async function copyNativeModule() {
  try {
    const srcPath = path.join(buildDir, 'Release/nexurejs_native.node');
    const distNativePath = path.join(distDir, 'native');

    // Create dist/native directory if it doesn't exist
    if (!fs.existsSync(distNativePath)) {
      fs.mkdirSync(distNativePath, { recursive: true });
    }

    const destPath = path.join(distNativePath, 'nexurejs_native.node');

    // Copy the built module
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`${Colors.GREEN}Copied native module to ${destPath}${Colors.RESET}`);
    } else {
      console.warn(`${Colors.YELLOW}Native module not found at ${srcPath}${Colors.RESET}`);
    }
  } catch (err) {
    console.error(`${Colors.RED}Failed to copy native module:${Colors.RESET}`, err.message);
  }
}

/**
 * Sanitize vcxproj files to remove illegal characters
 */
async function sanitizeVcxprojFiles() {
  if (CURRENT_PLATFORM !== 'win32') {
    return;
  }

  console.log(`${Colors.BLUE}Sanitizing vcxproj files to remove invalid characters...${Colors.RESET}`);

  try {
    // Get all vcxproj files in the build directory
    const files = await fsPromises.readdir(buildDir, { recursive: true });
    const vcxprojFiles = files.filter(file => file.endsWith('.vcxproj'));

    for (const file of vcxprojFiles) {
      const filePath = path.join(buildDir, file);
      let content = await fsPromises.readFile(filePath, 'utf8');

      // Check specifically for line 51 (which is the line with the error in nexurejs_native.vcxproj)
      const lines = content.split('\n');
      if (lines.length >= 51) {
        const line51 = lines[50]; // 0-based index for line 51

        // Check if this line contains the problematic escape character
        if (line51.includes('\x1B')) {
          console.log(`${Colors.YELLOW}Found escape character (0x1B) in line 51 of ${file}${Colors.RESET}`);
          lines[50] = line51.replace(/\x1B/g, '');
        }

        // Replace any other control characters in all lines
        for (let i = 0; i < lines.length; i++) {
          lines[i] = lines[i].replace(/[\x00-\x1F]/g, '');
        }

        // Join the lines back together
        const sanitized = lines.join('\n');

        if (sanitized !== content) {
          await fsPromises.writeFile(filePath, sanitized);
          console.log(`${Colors.GREEN}Sanitized ${file}${Colors.RESET}`);
        }
      } else {
        // If the file doesn't have 51 lines, just do a general sanitization
        const sanitized = content.replace(/[\x00-\x1F]/g, '');

        if (sanitized !== content) {
          await fsPromises.writeFile(filePath, sanitized);
          console.log(`${Colors.GREEN}Sanitized ${file}${Colors.RESET}`);
        }
      }
    }
  } catch (err) {
    console.error(`${Colors.YELLOW}Error sanitizing vcxproj files: ${err.message}${Colors.RESET}`);
    // Continue with the build even if sanitization fails
  }
}
