#!/usr/bin/env node

/**
 * View Benchmark Report Script
 * Opens the latest benchmark report in the default browser
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import open from 'open';

const REPORTS_DIR = './benchmarks/results';

async function viewLatestReport() {
  try {
    if (!existsSync(REPORTS_DIR)) {
      console.log('❌ No benchmark reports found. Run benchmarks first:');
      console.log('   npm run benchmark');
      process.exit(1);
    }

    const files = await readdir(REPORTS_DIR);
    const htmlReports = files
      .filter(file => file.endsWith('.html'))
      .sort()
      .reverse(); // Most recent first

    if (htmlReports.length === 0) {
      console.log('❌ No HTML benchmark reports found. Run benchmarks with:');
      console.log('   node benchmarks/simple-benchmark.js');
      process.exit(1);
    }

    const latestReport = htmlReports[0];
    const reportPath = join(REPORTS_DIR, latestReport);

    console.log(`🌐 Opening latest benchmark report: ${latestReport}`);
    console.log(`📄 Report path: ${reportPath}`);

    await open(reportPath);
    console.log('✅ Report opened in default browser');

  } catch (error) {
    console.error('❌ Error opening benchmark report:', error.message);
    process.exit(1);
  }
}

// List all available reports
async function listReports() {
  try {
    if (!existsSync(REPORTS_DIR)) {
      console.log('❌ No benchmark reports directory found');
      return;
    }

    const files = await readdir(REPORTS_DIR);
    const reports = files.filter(file => file.match(/\.(html|json|csv)$/));

    if (reports.length === 0) {
      console.log('📋 No benchmark reports found');
      return;
    }

    console.log('📋 Available benchmark reports:');
    console.log('=====================================');

    const grouped = {
      html: reports.filter(f => f.endsWith('.html')),
      json: reports.filter(f => f.endsWith('.json')),
      csv: reports.filter(f => f.endsWith('.csv'))
    };

    Object.entries(grouped).forEach(([type, files]) => {
      if (files.length > 0) {
        console.log(`\n${type.toUpperCase()} Reports:`);
        files.sort().reverse().forEach(file => {
          console.log(`  • ${file}`);
        });
      }
    });

  } catch (error) {
    console.error('❌ Error listing reports:', error.message);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--list') || args.includes('-l')) {
  listReports();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 NexureJS Benchmark Report Viewer

Usage:
  node scripts/view-benchmark-report.js           # Open latest HTML report
  node scripts/view-benchmark-report.js --list    # List all available reports
  node scripts/view-benchmark-report.js --help    # Show this help

Examples:
  # View latest benchmark report
  npm run benchmark:view

  # List all reports
  npm run benchmark:list
`);
} else {
  viewLatestReport();
}

export default { viewLatestReport, listReports };
