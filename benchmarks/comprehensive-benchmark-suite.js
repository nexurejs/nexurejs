#!/usr/bin/env node

/**
 * Comprehensive Benchmark Suite Orchestrator
 * Runs all available benchmarks and generates unified reports
 */

import { performance } from 'perf_hooks';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { cpus } from 'os';
import { spawn } from 'child_process';

// Import benchmark modules
import { AdvancedBenchmark } from './advanced-benchmark.js';
import { FrameworkComparison } from './framework-comparison-benchmark.js';
import { LoadTestBenchmark } from './load-test-benchmark.js';

// Comprehensive Suite Configuration
const CONFIG = {
  outputDir: './benchmarks/results',
  suites: [
    { name: 'simple', enabled: true, duration: 'short' },
    { name: 'advanced', enabled: true, duration: 'medium' },
    { name: 'comparison', enabled: true, duration: 'medium' },
    { name: 'load', enabled: false, duration: 'long' } // Disabled by default due to long duration
  ],
  reportFormats: ['json', 'html', 'markdown'],
  parallel: false // Set to true for parallel execution (requires more resources)
};

// Global Results Storage
const results = {
  suiteInfo: {},
  benchmarks: {},
  summary: {},
  performance: {},
  timestamp: new Date().toISOString(),
  version: '1.0-comprehensive'
};

class ComprehensiveBenchmarkSuite {
  constructor() {
    this.setupOutputDirectory();
    this.gatherSuiteInfo();
    this.startTime = performance.now();
  }

  setupOutputDirectory() {
    if (!existsSync(CONFIG.outputDir)) {
      mkdirSync(CONFIG.outputDir, { recursive: true });
    }
  }

  gatherSuiteInfo() {
    console.log('📋 Gathering comprehensive benchmark suite information...');

    results.suiteInfo = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: cpus().length,
      cpuModel: cpus()[0].model,
      memory: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      v8Version: process.versions.v8,
      enabledSuites: CONFIG.suites.filter(s => s.enabled).map(s => s.name),
      totalSuites: CONFIG.suites.filter(s => s.enabled).length,
      executionMode: CONFIG.parallel ? 'parallel' : 'sequential'
    };

    console.log(`💻 System: ${results.suiteInfo.platform} ${results.suiteInfo.arch}`);
    console.log(`🧮 CPU: ${results.suiteInfo.cpuModel} (${results.suiteInfo.cpus} cores)`);
    console.log(`🧠 Memory: ${results.suiteInfo.memory}MB, Node.js ${results.suiteInfo.nodeVersion}`);
    console.log(`📊 Enabled Suites: ${results.suiteInfo.enabledSuites.join(', ')}`);
    console.log(`⚡ Execution Mode: ${results.suiteInfo.executionMode}`);
  }

  // Run simple benchmark via subprocess
  async runSimpleBenchmark() {
    console.log('\n🚀 Running Simple Benchmark Suite...');

    return new Promise((resolve, reject) => {
      const child = spawn('node', ['benchmarks/simple-benchmark.js'], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Show progress to user
        if (text.includes('✅') || text.includes('📊') || text.includes('🌐')) {
          console.log(`  ${text.trim()}`);
        }
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            type: 'simple',
            status: 'completed',
            output: output,
            duration: performance.now() - this.startTime
          });
        } else {
          reject(new Error(`Simple benchmark failed with code ${code}: ${errorOutput}`));
        }
      });
    });
  }

  // Run advanced benchmark
  async runAdvancedBenchmark() {
    console.log('\n🚀 Running Advanced Benchmark Suite...');

    try {
      const benchmark = new AdvancedBenchmark();
      const result = await benchmark.runAdvancedBenchmarks();
      const reportPaths = benchmark.generateAdvancedReports();

      return {
        type: 'advanced',
        status: 'completed',
        result: result,
        reports: reportPaths,
        duration: performance.now() - this.startTime
      };
    } catch (error) {
      throw new Error(`Advanced benchmark failed: ${error.message}`);
    }
  }

  // Run framework comparison
  async runFrameworkComparison() {
    console.log('\n🚀 Running Framework Comparison...');

    try {
      const comparison = new FrameworkComparison();
      const result = await comparison.runFrameworkComparison();
      const reportPaths = comparison.generateComparisonReports();

      return {
        type: 'comparison',
        status: 'completed',
        result: result,
        reports: reportPaths,
        duration: performance.now() - this.startTime
      };
    } catch (error) {
      throw new Error(`Framework comparison failed: ${error.message}`);
    }
  }

  // Run load test
  async runLoadTest() {
    console.log('\n🚀 Running Load Test Suite...');

    try {
      const loadTest = new LoadTestBenchmark();
      const result = await loadTest.runLoadTestSuite();
      const reportPaths = loadTest.generateLoadTestReports();

      return {
        type: 'load',
        status: 'completed',
        result: result,
        reports: reportPaths,
        duration: performance.now() - this.startTime
      };
    } catch (error) {
      throw new Error(`Load test failed: ${error.message}`);
    }
  }

  // Run specific benchmark suite
  async runBenchmarkSuite(suiteName) {
    const startTime = performance.now();

    try {
      let result;

      switch (suiteName) {
        case 'simple':
          result = await this.runSimpleBenchmark();
          break;
        case 'advanced':
          result = await this.runAdvancedBenchmark();
          break;
        case 'comparison':
          result = await this.runFrameworkComparison();
          break;
        case 'load':
          result = await this.runLoadTest();
          break;
        default:
          throw new Error(`Unknown benchmark suite: ${suiteName}`);
      }

      const duration = performance.now() - startTime;
      console.log(`✅ ${suiteName.toUpperCase()} benchmark completed in ${(duration / 1000).toFixed(1)}s`);

      return {
        ...result,
        suiteDuration: duration,
        memoryUsage: process.memoryUsage()
      };

    } catch (error) {
      console.error(`❌ ${suiteName.toUpperCase()} benchmark failed:`, error.message);
      return {
        type: suiteName,
        status: 'failed',
        error: error.message,
        duration: performance.now() - startTime,
        memoryUsage: process.memoryUsage()
      };
    }
  }

  // Run all enabled benchmark suites
  async runComprehensiveSuite() {
    console.log('🎯 Starting Comprehensive NexureJS Benchmark Suite');
    console.log(`📊 Configuration: ${CONFIG.suites.filter(s => s.enabled).length} suites enabled`);
    console.log(`⚡ Execution mode: ${CONFIG.parallel ? 'Parallel' : 'Sequential'}`);

    const enabledSuites = CONFIG.suites.filter(s => s.enabled);
    const suiteStartTime = performance.now();

    if (CONFIG.parallel) {
      // Run benchmarks in parallel (requires more system resources)
      console.log('🔄 Running benchmarks in parallel...');
      const promises = enabledSuites.map(suite => this.runBenchmarkSuite(suite.name));
      const parallelResults = await Promise.allSettled(promises);

      enabledSuites.forEach((suite, index) => {
        const result = parallelResults[index];
        results.benchmarks[suite.name] = result.status === 'fulfilled'
          ? result.value
          : { type: suite.name, status: 'failed', error: result.reason };
      });

    } else {
      // Run benchmarks sequentially (more stable)
      console.log('🔄 Running benchmarks sequentially...');
      for (const suite of enabledSuites) {
        const result = await this.runBenchmarkSuite(suite.name);
        results.benchmarks[suite.name] = result;

        // Brief pause between suites
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const totalSuiteTime = performance.now() - suiteStartTime;

    // Generate comprehensive summary
    results.performance = {
      totalSuiteTime: totalSuiteTime,
      completedSuites: Object.values(results.benchmarks).filter(r => r.status === 'completed').length,
      failedSuites: Object.values(results.benchmarks).filter(r => r.status === 'failed').length,
      finalMemoryUsage: process.memoryUsage()
    };

    results.summary = this.generateSummary();

    console.log('\n✅ Comprehensive benchmark suite completed!');
    console.log(`📊 Results: ${results.performance.completedSuites} completed, ${results.performance.failedSuites} failed`);
    console.log(`⏱️  Total time: ${(totalSuiteTime / 1000 / 60).toFixed(1)} minutes`);

    return results;
  }

  // Generate comprehensive summary
  generateSummary() {
    const completedBenchmarks = Object.entries(results.benchmarks)
      .filter(([name, data]) => data.status === 'completed');

    const summary = {
      overview: {
        totalSuites: Object.keys(results.benchmarks).length,
        completedSuites: completedBenchmarks.length,
        successRate: (completedBenchmarks.length / Object.keys(results.benchmarks).length) * 100,
        totalDuration: results.performance.totalSuiteTime
      },
      highlights: {},
      recommendations: [],
      systemImpact: {
        memoryGrowth: results.performance.finalMemoryUsage.heapUsed - results.suiteInfo.memory * 1024 * 1024,
        peakMemory: Math.max(...Object.values(results.benchmarks).map(b => b.memoryUsage?.heapUsed || 0))
      }
    };

    // Extract key metrics from each successful benchmark
    completedBenchmarks.forEach(([name, data]) => {
      if (name === 'advanced' && data.result?.benchmarks) {
        summary.highlights.advanced = {
          cpuIntensiveRPS: Math.round(data.result.benchmarks.cpuIntensive?.requestsPerSecond || 0),
          simdOperationsRPS: Math.round(data.result.benchmarks.simdOperations?.requestsPerSecond || 0),
          stressTestRPS: Math.round(data.result.benchmarks.stressTest?.requestsPerSecond || 0)
        };
      }

      if (name === 'comparison' && data.result?.comparison) {
        summary.highlights.comparison = {
          winner: data.result.comparison.winner?.overall?.framework || 'Unknown',
          bestThroughput: data.result.comparison.winner?.basicRouting?.framework || 'Unknown',
          winnerScore: data.result.comparison.winner?.overall?.score || 0
        };
      }

      if (name === 'load' && data.result?.loadTests) {
        const scenarios = Object.values(data.result.loadTests);
        summary.highlights.load = {
          bestScenario: scenarios.sort((a, b) => b.successRate - a.successRate)[0]?.scenario || 'Unknown',
          maxThroughput: Math.max(...scenarios.map(s => s.requestsPerSecond || 0)),
          avgSuccessRate: scenarios.reduce((sum, s) => sum + (s.successRate || 0), 0) / scenarios.length
        };
      }
    });

    // Generate recommendations
    if (summary.highlights.advanced?.cpuIntensiveRPS > 1000) {
      summary.recommendations.push('Excellent CPU performance - suitable for compute-intensive applications');
    }

    if (summary.highlights.comparison?.winner === 'nexurejs') {
      summary.recommendations.push('NexureJS shows competitive performance against other frameworks');
    }

    if (summary.highlights.load?.avgSuccessRate > 95) {
      summary.recommendations.push('High reliability under load - suitable for production deployment');
    }

    if (summary.systemImpact.memoryGrowth < 100 * 1024 * 1024) { // Less than 100MB growth
      summary.recommendations.push('Efficient memory usage - low memory footprint');
    }

    return summary;
  }

  // Generate comprehensive reports
  generateComprehensiveReports() {
    console.log('📈 Generating comprehensive benchmark reports...');

    // Generate unified JSON report
    const jsonReport = JSON.stringify(results, null, 2);
    const jsonPath = join(CONFIG.outputDir, `comprehensive-benchmark-results-${Date.now()}.json`);
    writeFileSync(jsonPath, jsonReport);
    console.log(`📄 Comprehensive JSON report saved to: ${jsonPath}`);

    // Generate unified HTML report
    const htmlReport = this.generateComprehensiveHTMLReport();
    const htmlPath = join(CONFIG.outputDir, `comprehensive-benchmark-report-${Date.now()}.html`);
    writeFileSync(htmlPath, htmlReport);
    console.log(`🌐 Comprehensive HTML report saved to: ${htmlPath}`);

    // Generate executive summary
    const summaryReport = this.generateExecutiveSummary();
    const summaryPath = join(CONFIG.outputDir, `executive-summary-${Date.now()}.md`);
    writeFileSync(summaryPath, summaryReport);
    console.log(`📋 Executive summary saved to: ${summaryPath}`);

    return { jsonPath, htmlPath, summaryPath };
  }

  generateComprehensiveHTMLReport() {
    const benchmarks = Object.entries(results.benchmarks);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexureJS Comprehensive Benchmark Results</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            padding: 40px;
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 10px;
            font-size: 3rem;
        }
        .subtitle {
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 40px;
            font-size: 1.3rem;
        }
        .executive-summary {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 40px;
        }
        .executive-summary h2 {
            margin: 0 0 20px 0;
            font-size: 2rem;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .summary-metric {
            background: rgba(255,255,255,0.2);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-metric-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .summary-metric-label {
            font-size: 0.9rem;
            opacity: 0.9;
        }
        .benchmark-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 30px;
            margin: 40px 0;
        }
        .benchmark-card {
            border: 2px solid #e1e8ed;
            border-radius: 12px;
            padding: 25px;
            background: #fafbfc;
            transition: transform 0.2s ease;
        }
        .benchmark-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .benchmark-card.completed {
            border-color: #27ae60;
            background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
        }
        .benchmark-card.failed {
            border-color: #e74c3c;
            background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
        }
        .benchmark-name {
            font-size: 1.5rem;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 15px;
            text-transform: capitalize;
        }
        .benchmark-status {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            margin-bottom: 15px;
        }
        .status-completed {
            background: #d4edda;
            color: #155724;
        }
        .status-failed {
            background: #f8d7da;
            color: #721c24;
        }
        .benchmark-metrics {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        .metric {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border: 1px solid #e1e8ed;
        }
        .metric-value {
            font-size: 1.3rem;
            font-weight: bold;
            color: #27ae60;
        }
        .metric-label {
            font-size: 0.8rem;
            color: #7f8c8d;
            text-transform: uppercase;
            margin-top: 5px;
        }
        .section {
            margin: 50px 0;
            padding: 30px;
            border: 2px solid #e1e8ed;
            border-radius: 12px;
            background: #fafbfc;
        }
        .section h2 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
            margin-bottom: 30px;
        }
        .recommendations {
            background: #e8f4fd;
            border-left: 4px solid #3498db;
            padding: 20px;
            border-radius: 8px;
        }
        .recommendations ul {
            margin: 0;
            padding-left: 20px;
        }
        .recommendations li {
            margin: 10px 0;
            color: #2c3e50;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 NexureJS Comprehensive Benchmark Results</h1>
        <p class="subtitle">Generated on ${results.timestamp} | Complete Performance Analysis</p>

        <div class="executive-summary">
            <h2>📊 Executive Summary</h2>
            <div class="summary-grid">
                <div class="summary-metric">
                    <div class="summary-metric-value">${results.summary.overview.completedSuites}</div>
                    <div class="summary-metric-label">Completed Suites</div>
                </div>
                <div class="summary-metric">
                    <div class="summary-metric-value">${results.summary.overview.successRate.toFixed(1)}%</div>
                    <div class="summary-metric-label">Success Rate</div>
                </div>
                <div class="summary-metric">
                    <div class="summary-metric-value">${(results.summary.overview.totalDuration / 1000 / 60).toFixed(1)}m</div>
                    <div class="summary-metric-label">Total Duration</div>
                </div>
                <div class="summary-metric">
                    <div class="summary-metric-value">${Math.round(results.performance.finalMemoryUsage.heapUsed / 1024 / 1024)}MB</div>
                    <div class="summary-metric-label">Final Memory</div>
                </div>
            </div>
        </div>

        <div class="benchmark-grid">
            ${benchmarks.map(([name, data]) => `
                <div class="benchmark-card ${data.status}">
                    <div class="benchmark-name">${name} Benchmark</div>
                    <span class="benchmark-status status-${data.status}">${data.status.toUpperCase()}</span>

                    ${data.status === 'completed' ? `
                        <div class="benchmark-metrics">
                            <div class="metric">
                                <div class="metric-value">${(data.suiteDuration / 1000).toFixed(1)}s</div>
                                <div class="metric-label">Duration</div>
                            </div>
                            <div class="metric">
                                <div class="metric-value">${Math.round(data.memoryUsage.heapUsed / 1024 / 1024)}MB</div>
                                <div class="metric-label">Memory Used</div>
                            </div>
                        </div>
                    ` : `
                        <div style="color: #721c24; background: #f8d7da; padding: 15px; border-radius: 8px; margin-top: 15px;">
                            <strong>Error:</strong> ${data.error || 'Unknown error occurred'}
                        </div>
                    `}
                </div>
            `).join('')}
        </div>

        ${results.summary.highlights.advanced ? `
            <div class="section">
                <h2>⚡ Advanced Benchmark Highlights</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                    <div class="metric">
                        <div class="metric-value">${results.summary.highlights.advanced.cpuIntensiveRPS}</div>
                        <div class="metric-label">CPU Intensive (req/s)</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${results.summary.highlights.advanced.simdOperationsRPS}</div>
                        <div class="metric-label">SIMD Operations (req/s)</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${results.summary.highlights.advanced.stressTestRPS}</div>
                        <div class="metric-label">Stress Test (req/s)</div>
                    </div>
                </div>
            </div>
        ` : ''}

        ${results.summary.highlights.comparison ? `
            <div class="section">
                <h2>🏆 Framework Comparison Results</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                    <div class="metric">
                        <div class="metric-value">${results.summary.highlights.comparison.winner.toUpperCase()}</div>
                        <div class="metric-label">Overall Winner</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${results.summary.highlights.comparison.bestThroughput.toUpperCase()}</div>
                        <div class="metric-label">Best Throughput</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${results.summary.highlights.comparison.winnerScore}</div>
                        <div class="metric-label">Winner Score</div>
                    </div>
                </div>
            </div>
        ` : ''}

        <div class="section">
            <h2>💡 Recommendations</h2>
            <div class="recommendations">
                <ul>
                    ${results.summary.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    ${results.summary.recommendations.length === 0 ? '<li>Complete more benchmarks for detailed recommendations</li>' : ''}
                </ul>
            </div>
        </div>

        <div class="section">
            <h2>🔧 System Information</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <div>
                    <p><strong>Platform:</strong> ${results.suiteInfo.platform} ${results.suiteInfo.arch}</p>
                    <p><strong>CPU:</strong> ${results.suiteInfo.cpuModel}</p>
                    <p><strong>Cores:</strong> ${results.suiteInfo.cpus}</p>
                </div>
                <div>
                    <p><strong>Node.js:</strong> ${results.suiteInfo.nodeVersion}</p>
                    <p><strong>V8:</strong> ${results.suiteInfo.v8Version}</p>
                    <p><strong>Memory:</strong> ${results.suiteInfo.memory}MB initial</p>
                </div>
                <div>
                    <p><strong>Execution Mode:</strong> ${results.suiteInfo.executionMode}</p>
                    <p><strong>Total Suites:</strong> ${results.suiteInfo.totalSuites}</p>
                    <p><strong>Enabled Suites:</strong> ${results.suiteInfo.enabledSuites.join(', ')}</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  generateExecutiveSummary() {
    return `# NexureJS Comprehensive Benchmark Executive Summary

## Overview
- **Date**: ${results.timestamp}
- **Platform**: ${results.suiteInfo.platform} ${results.suiteInfo.arch}
- **System**: ${results.suiteInfo.cpuModel} (${results.suiteInfo.cpus} cores)
- **Total Duration**: ${(results.summary.overview.totalDuration / 1000 / 60).toFixed(1)} minutes

## Results Summary
- **Benchmark Suites**: ${results.summary.overview.totalSuites} total, ${results.summary.overview.completedSuites} completed
- **Success Rate**: ${results.summary.overview.successRate.toFixed(1)}%
- **Final Memory Usage**: ${Math.round(results.performance.finalMemoryUsage.heapUsed / 1024 / 1024)}MB

## Key Performance Highlights

${results.summary.highlights.advanced ? `
### Advanced Benchmark Performance
- **CPU-Intensive Operations**: ${results.summary.highlights.advanced.cpuIntensiveRPS} requests/second
- **SIMD Operations**: ${results.summary.highlights.advanced.simdOperationsRPS} requests/second
- **Stress Test Throughput**: ${results.summary.highlights.advanced.stressTestRPS} requests/second
` : ''}

${results.summary.highlights.comparison ? `
### Framework Comparison Results
- **Overall Winner**: ${results.summary.highlights.comparison.winner.toUpperCase()}
- **Best Throughput Framework**: ${results.summary.highlights.comparison.bestThroughput.toUpperCase()}
- **Winner Score**: ${results.summary.highlights.comparison.winnerScore}/100
` : ''}

${results.summary.highlights.load ? `
### Load Test Performance
- **Best Performing Scenario**: ${results.summary.highlights.load.bestScenario.toUpperCase()}
- **Maximum Throughput**: ${Math.round(results.summary.highlights.load.maxThroughput)} requests/second
- **Average Success Rate**: ${results.summary.highlights.load.avgSuccessRate.toFixed(1)}%
` : ''}

## Completed Benchmarks

${Object.entries(results.benchmarks).map(([name, data]) => `
### ${name.toUpperCase()} Benchmark
- **Status**: ${data.status === 'completed' ? '✅ Completed' : '❌ Failed'}
- **Duration**: ${(data.suiteDuration / 1000).toFixed(1)} seconds
- **Memory Impact**: ${Math.round(data.memoryUsage.heapUsed / 1024 / 1024)}MB
${data.status === 'failed' ? `- **Error**: ${data.error}` : ''}
`).join('')}

## Recommendations

${results.summary.recommendations.length > 0 ?
  results.summary.recommendations.map(rec => `- ${rec}`).join('\n') :
  '- Complete additional benchmarks for detailed performance recommendations'
}

## System Impact Analysis
- **Memory Growth**: ${Math.round(results.summary.systemImpact.memoryGrowth / 1024 / 1024)}MB during testing
- **Peak Memory Usage**: ${Math.round(results.summary.systemImpact.peakMemory / 1024 / 1024)}MB
- **System Stability**: ${results.summary.overview.successRate > 80 ? 'Excellent' : 'Needs attention'}

## Conclusion

NexureJS demonstrates ${results.summary.overview.successRate > 90 ? 'excellent' : results.summary.overview.successRate > 70 ? 'good' : 'mixed'} performance across the tested scenarios. ${results.summary.highlights.comparison?.winner === 'nexurejs' ? 'The framework shows competitive performance against other Node.js frameworks.' : ''} ${results.summary.highlights.advanced?.cpuIntensiveRPS > 1000 ? 'Strong CPU performance makes it suitable for compute-intensive applications.' : ''}

## Generated Reports
This executive summary is part of a comprehensive benchmark suite that includes:
- Detailed JSON data export
- Interactive HTML dashboard
- Individual benchmark reports
- Performance visualizations

---
*Generated by NexureJS Comprehensive Benchmark Suite v${results.version}*
`;
  }
}

// Main execution
async function main() {
  try {
    console.log('🎯 Starting NexureJS Comprehensive Benchmark Suite...');

    const suite = new ComprehensiveBenchmarkSuite();
    const results = await suite.runComprehensiveSuite();
    const reportPaths = suite.generateComprehensiveReports();

    console.log('\n🎉 Comprehensive benchmark suite completed successfully!');
    console.log('📊 Final Results Summary:');
    console.log(`   • Completed: ${results.performance.completedSuites}/${results.performance.completedSuites + results.performance.failedSuites} suites`);
    console.log(`   • Success Rate: ${results.summary.overview.successRate.toFixed(1)}%`);
    console.log(`   • Total Duration: ${(results.performance.totalSuiteTime / 1000 / 60).toFixed(1)} minutes`);
    console.log(`   • Final Memory: ${Math.round(results.performance.finalMemoryUsage.heapUsed / 1024 / 1024)}MB`);

    if (results.summary.highlights.advanced) {
      console.log('\n⚡ Advanced Performance:');
      console.log(`   • CPU Intensive: ${results.summary.highlights.advanced.cpuIntensiveRPS} req/s`);
      console.log(`   • SIMD Operations: ${results.summary.highlights.advanced.simdOperationsRPS} req/s`);
    }

    if (results.summary.highlights.comparison) {
      console.log('\n🏆 Framework Comparison:');
      console.log(`   • Winner: ${results.summary.highlights.comparison.winner.toUpperCase()}`);
      console.log(`   • Score: ${results.summary.highlights.comparison.winnerScore}/100`);
    }

    console.log('\n📄 Comprehensive Reports generated:');
    console.log(`   • Executive Summary: ${reportPaths.summaryPath}`);
    console.log(`   • Interactive Dashboard: ${reportPaths.htmlPath}`);
    console.log(`   • Complete Data Export: ${reportPaths.jsonPath}`);

    console.log('\n💡 Key Recommendations:');
    results.summary.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });

  } catch (error) {
    console.error('❌ Comprehensive benchmark suite failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ComprehensiveBenchmarkSuite };
