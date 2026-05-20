#!/usr/bin/env node

/**
 * Package Verification Script
 *
 * This script verifies that the package is ready for publishing:
 * - Checks package.json is valid
 * - Validates all required files are present
 * - Ensures version numbers are consistent
 * - Simulates what will be published with "npm pack"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// ANSI color codes for console output
const Colors = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  BOLD: '\x1b[1m'
};

// Required files that must be included in the package
const REQUIRED_FILES = [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts'
];

// Files/directories that must never be included in the published package.
// (Install scripts under scripts/ are shipped intentionally via the "files"
// allowlist, so scripts/ is not listed here.)
const EXCLUDED_FILES = [
  'node_modules',
  '.git',
  '.github',
  'coverage',
  'test',
  'benchmarks',
  'examples',
  '.env',
  '.npmrc',
  '.vscode'
];

/**
 * Print a section header
 */
function printSectionHeader(title) {
  console.log(`\n${Colors.BLUE}${Colors.BOLD}${title}${Colors.RESET}`);
  console.log(`${Colors.BLUE}${'='.repeat(title.length)}${Colors.RESET}`);
}

/**
 * Run a command and return its output
 */
function runCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    };
  }
}

/**
 * Verify package.json is valid
 */
async function verifyPackageJson() {
  printSectionHeader('Verifying package.json');

  try {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Check for required fields
    const requiredFields = ['name', 'version', 'description', 'main', 'types', 'license', 'repository', 'bugs', 'homepage'];
    const missingFields = requiredFields.filter(field => !packageJson[field]);

    if (missingFields.length > 0) {
      console.error(`${Colors.RED}Missing required fields in package.json: ${missingFields.join(', ')}${Colors.RESET}`);
      return false;
    }

    // Verify version number matches expected version (if provided)
    const expectedVersion = process.env.VERSION;
    if (expectedVersion && packageJson.version !== expectedVersion) {
      console.error(`${Colors.RED}Version mismatch: package.json has ${packageJson.version}, expected ${expectedVersion}${Colors.RESET}`);
      return false;
    }

    // Verify main, module, and types fields point to valid files
    ['main', 'module', 'types'].forEach(field => {
      const filePath = packageJson[field];
      if (filePath && !fs.existsSync(path.join(rootDir, filePath))) {
        console.error(`${Colors.RED}${field} file doesn't exist: ${filePath}${Colors.RESET}`);
        return false;
      }
    });

    // Verify exports map
    if (packageJson.exports) {
      for (const [key, value] of Object.entries(packageJson.exports)) {
        if (typeof value === 'object') {
          for (const [format, filePath] of Object.entries(value)) {
            if (!fs.existsSync(path.join(rootDir, filePath))) {
              console.error(`${Colors.RED}Export path doesn't exist: ${filePath} (${key}.${format})${Colors.RESET}`);
              return false;
            }
          }
        } else if (typeof value === 'string') {
          if (!fs.existsSync(path.join(rootDir, value))) {
            console.error(`${Colors.RED}Export path doesn't exist: ${value} (${key})${Colors.RESET}`);
            return false;
          }
        }
      }
    }

    console.log(`${Colors.GREEN}package.json is valid.${Colors.RESET}`);
    return true;
  } catch (error) {
    console.error(`${Colors.RED}Error verifying package.json:${Colors.RESET}`, error.message);
    return false;
  }
}

/**
 * Verify all required files exist
 */
async function verifyRequiredFiles() {
  printSectionHeader('Verifying Required Files');

  const missingFiles = [];

  for (const file of REQUIRED_FILES) {
    const filePath = path.join(rootDir, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
      console.error(`${Colors.RED}Missing required file: ${file}${Colors.RESET}`);
    }
  }

  if (missingFiles.length > 0) {
    return false;
  }

  console.log(`${Colors.GREEN}All required files exist.${Colors.RESET}`);
  return true;
}

/**
 * Pack the package and verify its contents
 */
async function verifyPackContents() {
  printSectionHeader('Verifying Package Contents');

  // Run npm pack with --json to get a structured list of what will be published.
  // (The human-readable `npm pack` output goes to stderr and its format changes
  // between npm versions; --json is stable and lands on stdout.)
  const packResult = runCommand('npm pack --dry-run --json', { silent: true });

  if (!packResult.success) {
    console.error(`${Colors.RED}npm pack failed:${Colors.RESET}`, packResult.error);
    return false;
  }

  // Parse the JSON output to get the list of included files
  let includedFiles = [];
  try {
    const packData = JSON.parse(packResult.output);
    const entry = Array.isArray(packData) ? packData[0] : packData;
    includedFiles = (entry?.files || []).map(file => file.path);
  } catch (error) {
    console.error(`${Colors.RED}Could not parse npm pack output:${Colors.RESET}`, error.message);
    return false;
  }

  // Check for required files
  const missingRequired = REQUIRED_FILES.filter(file =>
    !includedFiles.some(included => included === file || included.startsWith(`${file}/`))
  );

  if (missingRequired.length > 0) {
    console.error(`${Colors.RED}Required files missing from package:${Colors.RESET}`);
    missingRequired.forEach(file => console.error(`  ${file}`));
    return false;
  }

  // Check for excluded files
  const foundExcluded = includedFiles.filter(included =>
    EXCLUDED_FILES.some(excluded => included === excluded || included.startsWith(`${excluded}/`))
  );

  if (foundExcluded.length > 0) {
    console.warn(`${Colors.YELLOW}Warning: Excluded files found in package:${Colors.RESET}`);
    foundExcluded.forEach(file => console.warn(`  ${file}`));
  }

  // Check if anything suspicious is included
  const suspiciousPatterns = ['password', 'credentials', 'secret', '.env', 'config.json'];
  const suspicious = includedFiles.filter(file =>
    suspiciousPatterns.some(pattern => file.toLowerCase().includes(pattern))
  );

  if (suspicious.length > 0) {
    console.warn(`${Colors.YELLOW}Warning: Potentially sensitive files found:${Colors.RESET}`);
    suspicious.forEach(file => console.warn(`  ${file}`));
  }

  // Calculate approximate package size
  let totalSize = 0;
  for (const file of includedFiles) {
    try {
      const stats = fs.statSync(path.join(rootDir, file));
      totalSize += stats.size;
    } catch (error) {
      // Ignore files that don't exist or can't be accessed
    }
  }

  const mbSize = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`${Colors.BLUE}Package size: approximately ${mbSize} MB (${includedFiles.length} files)${Colors.RESET}`);

  if (mbSize > 10) {
    console.warn(`${Colors.YELLOW}Warning: Package is quite large (${mbSize} MB). Consider optimizing.${Colors.RESET}`);
  }

  // Actually create the package to verify it's buildable
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    const packName = `${packageJson.name}-${packageJson.version}.tgz`;

    // Clean up existing package file if it exists
    if (fs.existsSync(path.join(rootDir, packName))) {
      fs.unlinkSync(path.join(rootDir, packName));
    }

    // Create the package
    runCommand('npm pack', { silent: true });

    // Verify the package can be extracted
    if (fs.existsSync(path.join(rootDir, packName))) {
      console.log(`${Colors.GREEN}Successfully created package: ${packName}${Colors.RESET}`);

      // Check integrity
      const hash = crypto.createHash('sha256');
      const fileBuffer = fs.readFileSync(path.join(rootDir, packName));
      hash.update(fileBuffer);
      const fileHash = hash.digest('hex');
      console.log(`${Colors.BLUE}Package SHA256: ${fileHash}${Colors.RESET}`);

      // Clean up
      fs.unlinkSync(path.join(rootDir, packName));
    } else {
      console.error(`${Colors.RED}Failed to create package.${Colors.RESET}`);
      return false;
    }
  } catch (error) {
    console.error(`${Colors.RED}Error creating package:${Colors.RESET}`, error.message);
    return false;
  }

  console.log(`${Colors.GREEN}Package contents verification successful.${Colors.RESET}`);
  return true;
}

/**
 * Verify that all dist files exist and are non-empty
 */
async function verifyDistFiles() {
  printSectionHeader('Verifying Distribution Files');

  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error(`${Colors.RED}dist directory does not exist!${Colors.RESET}`);
    return false;
  }

  // Check for non-empty index files
  const criticalFiles = [
    'index.js',
    'index.d.ts'
  ];

  const problems = [];

  for (const file of criticalFiles) {
    const filePath = path.join(distDir, file);

    if (!fs.existsSync(filePath)) {
      problems.push(`Missing: ${file}`);
      continue;
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      problems.push(`Empty: ${file}`);
    }
  }

  if (problems.length > 0) {
    console.error(`${Colors.RED}Problems with distribution files:${Colors.RESET}`);
    problems.forEach(problem => console.error(`  ${problem}`));
    return false;
  }

  console.log(`${Colors.GREEN}All distribution files exist and are non-empty.${Colors.RESET}`);
  return true;
}

/**
 * Main function
 */
async function main() {
  console.log(`${Colors.BOLD}Verifying package before publication${Colors.RESET}`);

  // Run all verifications
  const results = await Promise.all([
    verifyPackageJson(),
    verifyRequiredFiles(),
    verifyDistFiles(),
    verifyPackContents()
  ]);

  // Check if all verifications passed
  const allPassed = results.every(result => result);

  if (allPassed) {
    console.log(`\n${Colors.GREEN}${Colors.BOLD}All package verifications passed! Ready for publication.${Colors.RESET}`);
    process.exit(0);
  } else {
    console.error(`\n${Colors.RED}${Colors.BOLD}Some package verifications failed. Please fix the issues before publishing.${Colors.RESET}`);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(`${Colors.RED}Error:${Colors.RESET}`, error);
  process.exit(1);
});
