#!/usr/bin/env node

/**
 * Comprehensive Benchmark Runner for NexureJS
 * Runs all available benchmarks and generates a unified report
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Available benchmarks
const BENCHMARKS = [
  {
    name: 'Simple Real-World Benchmark',
    file: 'simple-benchmark.js',
    description: 'Tests basic API scenarios with realistic workloads'
  },
  {
    name: 'Framework Comparison',
    file: 'framework-showdown.js',
    description: 'Compares NexureJS against Express, Fastify, and Koa'
  },
  {
    name: 'Advanced Enterprise Benchmark',
    file: 'advanced-enterprise-benchmark.js',
    description: 'ML-powered enterprise-grade performance testing'
  },
  {
    name: 'Real-time Analytics',
    file: 'realtime-analytics-benchmark.js',
    description: 'Real-time performance monitoring and analytics'
  },
  {
    name: 'Load Test Benchmark',
    file: 'load-test-benchmark.js',
    description: 'Advanced load testing with realistic traffic patterns'
  }
];

// Results storage
const results = {
  summary: {},
  benchmarks: {},
  metadata: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    totalDuration: 0
  }
};

/**
 * Utility Functions
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Run a single benchmark
 */
async function runBenchmark(benchmark) {
  log(`Starting ${benchmark.name}...`);
  const startTime = performance.now();

  return new Promise((resolve) => {
    const benchmarkPath = path.join(__dirname, benchmark.file);

    // Check if benchmark file exists
    fs.access(benchmarkPath).then(() => {
      const process = spawn('node', [benchmarkPath], {
        stdio: 'inherit',
        cwd: __dirname
      });

      process.on('close', (code) => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        resolve({
          name: benchmark.name,
          file: benchmark.file,
          description: benchmark.description,
          success: code === 0,
          duration,
          exitCode: code
        });
      });

      process.on('error', (error) => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        resolve({
          name: benchmark.name,
          file: benchmark.file,
          description: benchmark.description,
          success: false,
          duration,
          error: error.message
        });
      });

    }).catch(() => {
      log(`⚠️  Benchmark file not found: ${benchmark.file}`);
      resolve({
        name: benchmark.name,
        file: benchmark.file,
        description: benchmark.description,
        success: false,
        duration: 0,
        error: 'File not found'
      });
    });
  });
}

/**
 * Generate HTML report
 */
async function generateHTMLReport() {
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexureJS Benchmark Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .summary {
            padding: 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            color: #495057;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .summary-card .value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .benchmarks {
            padding: 30px;
        }
        .benchmark {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .benchmark-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
        }
        .benchmark-header h3 {
            margin: 0 0 5px 0;
            color: #495057;
        }
        .benchmark-header p {
            margin: 0;
            color: #6c757d;
            font-size: 0.9em;
        }
        .benchmark-content {
            padding: 20px;
        }
        .status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
        }
        .metadata {
            padding: 30px;
            background: #f8f9fa;
            border-top: 1px solid #e9ecef;
        }
        .metadata h3 {
            margin: 0 0 15px 0;
            color: #495057;
        }
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .metadata-item {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        .metadata-item strong {
            display: block;
            color: #495057;
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 NexureJS Benchmark Report</h1>
            <p>Comprehensive Performance Analysis • ${results.metadata.timestamp}</p>
        </div>

        <div class="summary">
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>Total Benchmarks</h3>
                    <div class="value">${BENCHMARKS.length}</div>
                </div>
                <div class="summary-card">
                    <h3>Successful</h3>
                    <div class="value">${results.summary.successful || 0}</div>
                </div>
                <div class="summary-card">
                    <h3>Failed</h3>
                    <div class="value">${results.summary.failed || 0}</div>
                </div>
                <div class="summary-card">
                    <h3>Total Duration</h3>
                    <div class="value">${(results.metadata.totalDuration / 1000 / 60).toFixed(1)}m</div>
                </div>
            </div>
        </div>

        <div class="benchmarks">
            <h2>📊 Benchmark Results</h2>
            ${Object.entries(results.benchmarks).map(([name, result]) => `
                <div class="benchmark">
                    <div class="benchmark-header">
                        <h3>${result.name}</h3>
                        <p>${result.description}</p>
                    </div>
                    <div class="benchmark-content">
                        <div class="status ${result.success ? 'success' : 'error'}">
                            ${result.success ? '✅ Success' : '❌ Failed'}
                        </div>
                        <p><strong>Duration:</strong> ${(result.duration / 1000).toFixed(2)}s</p>
                        <p><strong>File:</strong> ${result.file}</p>
                        ${result.error ? `<p><strong>Error:</strong> ${result.error}</p>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="metadata">
            <h3>🔧 System Information</h3>
            <div class="metadata-grid">
                <div class="metadata-item">
                    <strong>Node.js Version</strong>
                    ${results.metadata.nodeVersion}
                </div>
                <div class="metadata-item">
                    <strong>Platform</strong>
                    ${results.metadata.platform}
                </div>
                <div class="metadata-item">
                    <strong>Architecture</strong>
                    ${results.metadata.arch}
                </div>
                <div class="metadata-item">
                    <strong>Generated</strong>
                    ${new Date(results.metadata.timestamp).toLocaleString()}
                </div>
            </div>
        </div>
    </div>
</body>
</html>
`;

  const reportPath = path.join(__dirname, 'results', 'benchmark-report.html');
  await fs.mkdir(path.join(__dirname, 'results'), { recursive: true });
  await fs.writeFile(reportPath, htmlContent);

  return reportPath;
}

/**
 * Main execution
 */
async function runAllBenchmarks() {
  const startTime = performance.now();

  log('🚀 Starting Comprehensive NexureJS Benchmarks');
  log(`Running ${BENCHMARKS.length} benchmark suites...`);

  // Run benchmarks sequentially to avoid conflicts
  for (const benchmark of BENCHMARKS) {
    const result = await runBenchmark(benchmark);
    results.benchmarks[benchmark.name] = result;

    if (result.success) {
      log(`✅ ${benchmark.name} completed in ${(result.duration / 1000).toFixed(2)}s`);
    } else {
      log(`❌ ${benchmark.name} failed: ${result.error || 'Unknown error'}`);
    }

    // Small delay between benchmarks
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const endTime = performance.now();
  results.metadata.totalDuration = endTime - startTime;

  // Generate summary
  const successful = Object.values(results.benchmarks).filter(b => b.success).length;
  const failed = Object.values(results.benchmarks).filter(b => !b.success).length;

  results.summary = {
    total: BENCHMARKS.length,
    successful,
    failed,
    successRate: (successful / BENCHMARKS.length) * 100,
    totalDuration: results.metadata.totalDuration
  };

  // Save results
  const resultsPath = path.join(__dirname, 'results', 'all-benchmarks-results.json');
  await fs.mkdir(path.join(__dirname, 'results'), { recursive: true });
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));

  // Generate HTML report
  const htmlReportPath = await generateHTMLReport();

  // Display summary
  console.log('\n' + '='.repeat(60));
  console.log('🏆 COMPREHENSIVE BENCHMARK SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Benchmarks: ${results.summary.total}`);
  console.log(`Successful: ${results.summary.successful}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Success Rate: ${results.summary.successRate.toFixed(1)}%`);
  console.log(`Total Duration: ${(results.summary.totalDuration / 1000 / 60).toFixed(1)} minutes`);
  console.log('='.repeat(60));

  console.log('\n📄 Reports Generated:');
  console.log(`JSON: ${resultsPath}`);
  console.log(`HTML: ${htmlReportPath}`);

  if (results.summary.failed > 0) {
    console.log('\n⚠️  Some benchmarks failed. Check the reports for details.');
    console.log('Failed benchmarks:');
    Object.values(results.benchmarks)
      .filter(b => !b.success)
      .forEach(b => console.log(`  - ${b.name}: ${b.error || 'Unknown error'}`));
  }

  log('\n✅ All benchmarks completed!');
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllBenchmarks().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runAllBenchmarks };
