#!/usr/bin/env node

/**
 * NexureJS Bundle Size Analysis
 * Analyzes bundle size and provides optimization recommendations
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('📦 NexureJS Bundle Size Analysis\n');

  try {
    const analysis = await analyzeBundleSize();
    displayResults(analysis);

    if (analysis.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      analysis.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      analysis.recommendations.forEach(rec => console.log(`  - ${rec}`));
    }

  } catch (error) {
    console.error('❌ Bundle size analysis failed:', error.message);
    process.exit(1);
  }
}

async function analyzeBundleSize() {
  const analysis = {
    files: [],
    totalSize: 0,
    warnings: [],
    recommendations: []
  };

  // Analyze dist directory
  const distPath = path.join(rootDir, 'dist');

  try {
    await fs.access(distPath);
  } catch {
    throw new Error('Build directory not found. Run "npm run build" first.');
  }

  const files = await getFilesRecursively(distPath);

  for (const file of files) {
    const stats = await fs.stat(file);
    const relativePath = path.relative(rootDir, file);
    const ext = path.extname(file);

    const fileInfo = {
      path: relativePath,
      size: stats.size,
      type: getFileType(ext),
      humanSize: formatBytes(stats.size)
    };

    analysis.files.push(fileInfo);
    analysis.totalSize += stats.size;
  }

  // Sort by size (largest first)
  analysis.files.sort((a, b) => b.size - a.size);

  // Generate warnings and recommendations
  generateWarnings(analysis);
  generateRecommendations(analysis);

  return analysis;
}

async function getFilesRecursively(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await getFilesRecursively(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function getFileType(ext) {
  const types = {
    '.js': 'JavaScript',
    '.mjs': 'ES Module',
    '.cjs': 'CommonJS',
    '.ts': 'TypeScript',
    '.d.ts': 'Type Definition',
    '.json': 'JSON',
    '.map': 'Source Map',
    '.node': 'Native Module'
  };

  return types[ext] || 'Other';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function generateWarnings(analysis) {
  const largeFiles = analysis.files.filter(f => f.size > 1024 * 1024); // > 1MB

  largeFiles.forEach(file => {
    analysis.warnings.push(`Large file: ${file.path} (${file.humanSize})`);
  });

  // Check total size
  if (analysis.totalSize > 10 * 1024 * 1024) { // > 10MB
    analysis.warnings.push(`Large total bundle size: ${formatBytes(analysis.totalSize)}`);
  }
}

function generateRecommendations(analysis) {
  const jsFiles = analysis.files.filter(f => f.type === 'JavaScript');

  // Check for optimization opportunities
  const largeJsFiles = jsFiles.filter(f => f.size > 500 * 1024); // > 500KB
  if (largeJsFiles.length > 0) {
    analysis.recommendations.push('Consider code splitting for large JavaScript files');
  }

  // Check for tree shaking opportunities
  const totalJsSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalJsSize > 2 * 1024 * 1024) { // > 2MB
    analysis.recommendations.push('Consider tree shaking to reduce JavaScript bundle size');
  }

  // General recommendations
  analysis.recommendations.push('Use gzip/brotli compression in production');
  analysis.recommendations.push('Consider minification for production builds');
}

function displayResults(analysis) {
  console.log('📊 Bundle Size Summary');
  console.log('======================');
  console.log(`Total files: ${analysis.files.length}`);
  console.log(`Total size: ${formatBytes(analysis.totalSize)}\n`);

  // Group by file type
  const byType = {};
  analysis.files.forEach(file => {
    if (!byType[file.type]) {
      byType[file.type] = { count: 0, size: 0 };
    }
    byType[file.type].count++;
    byType[file.type].size += file.size;
  });

  console.log('📋 By File Type:');
  Object.entries(byType)
    .sort(([,a], [,b]) => b.size - a.size)
    .forEach(([type, stats]) => {
      console.log(`  ${type}: ${stats.count} files, ${formatBytes(stats.size)}`);
    });

  // Show largest files
  console.log('\n📈 Largest Files:');
  analysis.files.slice(0, 10).forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.path} (${file.humanSize})`);
  });

  // Show size distribution
  console.log('\n📊 Size Distribution:');
  const sizeRanges = [
    { name: '< 10KB', min: 0, max: 10 * 1024 },
    { name: '10KB - 100KB', min: 10 * 1024, max: 100 * 1024 },
    { name: '100KB - 1MB', min: 100 * 1024, max: 1024 * 1024 },
    { name: '> 1MB', min: 1024 * 1024, max: Infinity }
  ];

  sizeRanges.forEach(range => {
    const filesInRange = analysis.files.filter(f =>
      f.size >= range.min && f.size < range.max
    );
    const totalSize = filesInRange.reduce((sum, f) => sum + f.size, 0);
    console.log(`  ${range.name}: ${filesInRange.length} files, ${formatBytes(totalSize)}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
