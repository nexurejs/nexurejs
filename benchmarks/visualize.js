// Benchmark Results Visualizer
import fs from 'fs';
import path from 'path';

// Configuration
const RESULTS_DIR = './benchmark-results';
const REPORTS_DIR = './benchmark-reports';

// Create reports directory if it doesn't exist
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Generate HTML report from benchmark results
const generateReport = (resultsFile) => {
  try {
    // Read results file
    const resultsData = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const isComparison = resultsFile.includes('comparison');

    // Extract filename without extension
    const fileName = path.basename(resultsFile, '.json');

    // Generate timestamp
    const date = new Date(resultsData.date);
    const timestamp = date.toLocaleString();

    // Generate HTML
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nexure.js ${isComparison ? 'Comparison' : 'Performance'} Report</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        h1, h2, h3 {
          color: #2c3e50;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eee;
          margin-bottom: 20px;
          padding-bottom: 10px;
        }
        .header-right {
          text-align: right;
          font-size: 0.9em;
          color: #7f8c8d;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          padding: 12px 15px;
          border-bottom: 1px solid #ddd;
          text-align: left;
        }
        th {
          background-color: #f8f9fa;
          font-weight: 600;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          margin: 20px 0;
        }
        .metric-card {
          flex: 1;
          min-width: 250px;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          background-color: #fff;
        }
        .metric-value {
          font-size: 1.8em;
          font-weight: bold;
          color: #2980b9;
          margin: 10px 0;
        }
        .chart-container {
          width: 100%;
          height: 400px;
          margin: 30px 0;
        }
        .bar-chart {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .bar-row {
          display: flex;
          align-items: center;
        }
        .bar-label {
          width: 30%;
          text-align: right;
          padding-right: 10px;
          font-weight: 500;
        }
        .bar-container {
          width: 60%;
          background-color: #ecf0f1;
          border-radius: 4px;
          height: 30px;
          position: relative;
        }
        .bar {
          background-color: #3498db;
          height: 100%;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 10px;
          color: white;
          font-weight: 500;
          transition: width 0.5s ease;
        }
        .bar-value {
          width: 10%;
          text-align: left;
          padding-left: 10px;
        }
        .comparison-row .bar {
          background-color: #2ecc71;
        }
        .comparison-row.slower .bar {
          background-color: #e74c3c;
        }
        .summary {
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin: 30px 0;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #eee;
          font-size: 0.9em;
          color: #7f8c8d;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Nexure.js ${isComparison ? 'Comparison' : 'Performance'} Report</h1>
          <p>Performance metrics and analysis</p>
        </div>
        <div class="header-right">
          <p>Generated: ${timestamp}</p>
          <p>Total duration: ${(resultsData.totalDuration / 1000).toFixed(2)} seconds</p>
        </div>
      </div>
    `;

    if (isComparison) {
      // Comparison report
      html += generateComparisonReport(resultsData);
    } else {
      // Standard benchmark report
      html += generateBenchmarkReport(resultsData);
    }

    html += `
      <div class="footer">
        <p>Nexure.js Performance Benchmarks</p>
      </div>

      <script>
        // Initialize any charts when the page loads
        document.addEventListener('DOMContentLoaded', function() {
          // Any JavaScript for charts can go here
          const elements = document.querySelectorAll('[data-chart]');
          elements.forEach(element => {
            const chartData = JSON.parse(element.dataset.values);
            const chartLabels = JSON.parse(element.dataset.labels);

            new Chart(element, {
              type: element.dataset.chart,
              data: {
                labels: chartLabels,
                datasets: [{
                  label: element.dataset.title,
                  data: chartData,
                  backgroundColor: element.dataset.colors ? JSON.parse(element.dataset.colors) : [
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(255, 159, 64, 0.7)'
                  ],
                  borderColor: 'rgba(54, 162, 235, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
          });
        });
      </script>
    </body>
    </html>
    `;

    // Write HTML to file
    const outputFile = path.join(REPORTS_DIR, `${fileName}.html`);
    fs.writeFileSync(outputFile, html);

    console.log(`Report generated: ${outputFile}`);

    return outputFile;
  } catch (error) {
    console.error(`Failed to generate report for ${resultsFile}:`, error);
    return null;
  }
};

// Generate comparison report
const generateComparisonReport = (data) => {
  let html = '<h2>Performance Comparison Results</h2>';

  // Summary section
  html += `
    <div class="summary">
      <h3>Summary</h3>
      <div class="bar-chart">
  `;

  // Parse the performance comparisons
  const comparisons = [];

  // Base64 encoding
  if (data.base64Encoding) {
    const nexureResult = data.base64Encoding.find(r => r.name === 'Nexure.js (medium)');
    const nodeResult = data.base64Encoding.find(r => r.name === 'Node.js Buffer (medium)');

    if (nexureResult && nodeResult) {
      const speedup = nodeResult.avgDuration / nexureResult.avgDuration;
      comparisons.push({
        name: 'Base64 Encoding',
        speedup,
        isFaster: speedup > 1
      });
    }
  }

  // URL encoding
  if (data.urlEncoding) {
    const nexureResult = data.urlEncoding.find(r => r.name === 'Nexure.js (complex)');
    const nodeResult = data.urlEncoding.find(r => r.name === 'encodeURIComponent (complex)');

    if (nexureResult && nodeResult) {
      const speedup = nodeResult.avgDuration / nexureResult.avgDuration;
      comparisons.push({
        name: 'URL Encoding',
        speedup,
        isFaster: speedup > 1
      });
    }
  }

  // Thread pool
  if (data.threadPool) {
    const nexureResult = data.threadPool.find(r => r.name === 'Nexure.js ThreadPool');
    const workerResult = data.threadPool.find(r => r.name === 'Node.js Worker Threads');

    if (nexureResult && workerResult) {
      const speedup = workerResult.avgDuration / nexureResult.avgDuration;
      comparisons.push({
        name: 'Thread Pool',
        speedup,
        isFaster: speedup > 1
      });
    }
  }

  // Parallel execution
  if (data.parallelExecution) {
    const nexureResult = data.parallelExecution.find(r => r.name === 'Nexure.js (50 tasks)');
    const promiseResult = data.parallelExecution.find(r => r.name === 'Promise.all (50 tasks)');

    if (nexureResult && promiseResult) {
      const speedup = promiseResult.avgDuration / nexureResult.avgDuration;
      comparisons.push({
        name: 'Parallel Execution',
        speedup,
        isFaster: speedup > 1
      });
    }
  }

  // Generate comparison chart
  comparisons.forEach(comp => {
    const percentage = comp.isFaster ? Math.min(comp.speedup * 50, 100) : Math.min(100 / comp.speedup, 100);

    html += `
      <div class="bar-row comparison-row ${!comp.isFaster ? 'slower' : ''}">
        <div class="bar-label">${comp.name}</div>
        <div class="bar-container">
          <div class="bar" style="width: ${percentage}%;">
            ${comp.speedup.toFixed(2)}x ${comp.isFaster ? 'faster' : 'slower'}
          </div>
        </div>
        <div class="bar-value">${comp.isFaster ? '+' : '-'}${Math.abs((comp.speedup - 1) * 100).toFixed(1)}%</div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  // Detailed sections
  html += generateDetailedSection('Base64 Encoding', data.base64Encoding);
  html += generateDetailedSection('URL Encoding', data.urlEncoding);
  html += generateDetailedSection('Thread Pool', data.threadPool);
  html += generateDetailedSection('Parallel Execution', data.parallelExecution);

  return html;
};

// Generate benchmark report
const generateBenchmarkReport = (data) => {
  let html = '<h2>Performance Benchmark Results</h2>';

  // Generate metrics overview
  html += `
    <div class="metrics">
      <div class="metric-card">
        <h3>Thread Pool Tasks</h3>
        <div class="metric-value">${data.threadPool?.metrics?.submitted || 0}</div>
        <p>Total tasks submitted</p>
      </div>

      <div class="metric-card">
        <h3>Encoding Operations</h3>
        <div class="metric-value">${
          (data.stringEncoder?.metrics?.totalEncodeCount || 0) +
          (data.stringEncoder?.metrics?.totalDecodeCount || 0)
        }</div>
        <p>Total encoding/decoding operations</p>
      </div>

      <div class="metric-card">
        <h3>Processing Time</h3>
        <div class="metric-value">${(data.totalDuration / 1000).toFixed(2)}s</div>
        <p>Total benchmark duration</p>
      </div>
    </div>
  `;

  // Thread Pool results
  if (data.threadPool && data.threadPool.results) {
    html += `
      <h2>Thread Pool Performance</h2>

      <div class="chart-container">
        <canvas id="threadPoolChart"
                data-chart="bar"
                data-title="Operations per Second"
                data-labels='${JSON.stringify(data.threadPool.results.map(r => r.name))}'
                data-values='${JSON.stringify(data.threadPool.results.map(r => r.opsPerSecond))}'>
        </canvas>
      </div>

      <table>
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>Iterations</th>
            <th>Total Time (ms)</th>
            <th>Avg Time (ms)</th>
            <th>Operations/sec</th>
          </tr>
        </thead>
        <tbody>
          ${data.threadPool.results.map(r => `
            <tr>
              <td>${r.name}</td>
              <td>${r.iterations.toLocaleString()}</td>
              <td>${r.totalDuration.toFixed(2)}</td>
              <td>${r.avgDuration.toFixed(4)}</td>
              <td>${r.opsPerSecond.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3>Thread Pool Metrics</h3>

      <div class="chart-container">
        <canvas id="threadPoolMetricsChart"
                data-chart="pie"
                data-title="Task Distribution"
                data-labels='${JSON.stringify(['Completed', 'Failed', 'Cancelled'])}'
                data-values='${JSON.stringify([
                  data.threadPool.metrics.completed || 0,
                  data.threadPool.metrics.failed || 0,
                  data.threadPool.metrics.cancelled || 0
                ])}'>
        </canvas>
      </div>

      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.threadPool.metrics).map(([key, value]) => `
            <tr>
              <td>${key}</td>
              <td>${typeof value === 'number' ? value.toLocaleString() : value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // String Encoder results
  if (data.stringEncoder && data.stringEncoder.results) {
    html += `
      <h2>String Encoder Performance</h2>

      <div class="chart-container">
        <canvas id="stringEncoderChart"
                data-chart="bar"
                data-title="Operations per Second"
                data-labels='${JSON.stringify(data.stringEncoder.results.map(r => r.name))}'
                data-values='${JSON.stringify(data.stringEncoder.results.map(r => r.opsPerSecond))}'>
        </canvas>
      </div>

      <table>
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>Iterations</th>
            <th>Total Time (ms)</th>
            <th>Avg Time (ms)</th>
            <th>Operations/sec</th>
          </tr>
        </thead>
        <tbody>
          ${data.stringEncoder.results.map(r => `
            <tr>
              <td>${r.name}</td>
              <td>${r.iterations.toLocaleString()}</td>
              <td>${r.totalDuration.toFixed(2)}</td>
              <td>${r.avgDuration.toFixed(4)}</td>
              <td>${r.opsPerSecond.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3>Encoder Metrics</h3>

      <div class="chart-container">
        <canvas id="encoderOperationsChart"
                data-chart="pie"
                data-title="Encoding Operations"
                data-labels='${JSON.stringify(['Base64', 'URL', 'HTML', 'Other'])}'
                data-values='${JSON.stringify([
                  (data.stringEncoder.metrics.base64EncodeCount || 0) + (data.stringEncoder.metrics.base64DecodeCount || 0),
                  (data.stringEncoder.metrics.urlEncodeCount || 0) + (data.stringEncoder.metrics.urlDecodeCount || 0),
                  (data.stringEncoder.metrics.htmlEncodeCount || 0) + (data.stringEncoder.metrics.htmlDecodeCount || 0),
                  ((data.stringEncoder.metrics.totalEncodeCount || 0) + (data.stringEncoder.metrics.totalDecodeCount || 0)) -
                  ((data.stringEncoder.metrics.base64EncodeCount || 0) + (data.stringEncoder.metrics.base64DecodeCount || 0) +
                   (data.stringEncoder.metrics.urlEncodeCount || 0) + (data.stringEncoder.metrics.urlDecodeCount || 0) +
                   (data.stringEncoder.metrics.htmlEncodeCount || 0) + (data.stringEncoder.metrics.htmlDecodeCount || 0))
                ])}'>
        </canvas>
      </div>

      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.stringEncoder.metrics).map(([key, value]) => `
            <tr>
              <td>${key}</td>
              <td>${typeof value === 'number' ? value.toLocaleString() : value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  return html;
};

// Generate a detailed section for comparison results
const generateDetailedSection = (title, results) => {
  if (!results || results.length === 0) {
    return '';
  }

  let html = `<h2>${title} Comparison</h2>`;

  // Generate chart data
  const labels = results.map(r => r.name);
  const data = results.map(r => r.opsPerSecond);

  html += `
    <div class="chart-container">
      <canvas id="${title.toLowerCase().replace(/\s+/g, '')}Chart"
              data-chart="bar"
              data-title="Operations per Second"
              data-labels='${JSON.stringify(labels)}'
              data-values='${JSON.stringify(data)}'>
      </canvas>
    </div>

    <table>
      <thead>
        <tr>
          <th>Implementation</th>
          <th>Iterations</th>
          <th>Avg Time (ms)</th>
          <th>Operations/sec</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => `
          <tr>
            <td>${r.name}</td>
            <td>${r.iterations.toLocaleString()}</td>
            <td>${r.avgDuration.toFixed(4)}</td>
            <td>${r.opsPerSecond.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  return html;
};

// Process all result files in the directory
const processResultFiles = () => {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`Results directory not found: ${RESULTS_DIR}`);
    return;
  }

  // Get all JSON files
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(RESULTS_DIR, file));

  if (files.length === 0) {
    console.log('No benchmark result files found.');
    return;
  }

  console.log(`Found ${files.length} benchmark result files.`);

  // Generate reports for each file
  const generatedReports = files.map(file => generateReport(file))
    .filter(report => report !== null);

  console.log(`Generated ${generatedReports.length} reports.`);

  // Generate index file if we have reports
  if (generatedReports.length > 0) {
    generateIndexFile(generatedReports);
  }
};

// Generate an index file for all reports
const generateIndexFile = (reportFiles) => {
  const reports = reportFiles.map(file => {
    const fileName = path.basename(file);
    const isComparison = fileName.includes('comparison');
    const date = new Date(parseInt(fileName.split('-')[1]));

    return {
      file: fileName,
      type: isComparison ? 'Comparison' : 'Benchmark',
      date
    };
  }).sort((a, b) => b.date - a.date); // Sort newest first

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nexure.js Benchmark Reports</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }
      h1, h2 {
        color: #2c3e50;
      }
      .reports-list {
        list-style: none;
        padding: 0;
      }
      .report-item {
        margin-bottom: 10px;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .report-item:hover {
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
      .report-title {
        font-weight: 600;
      }
      .report-date {
        color: #7f8c8d;
        font-size: 0.9em;
      }
      .report-type {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8em;
        font-weight: bold;
      }
      .report-type.benchmark {
        background-color: #e3f2fd;
        color: #1976d2;
      }
      .report-type.comparison {
        background-color: #e8f5e9;
        color: #388e3c;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #eee;
        font-size: 0.9em;
        color: #7f8c8d;
      }
    </style>
  </head>
  <body>
    <h1>Nexure.js Benchmark Reports</h1>
    <p>Performance benchmark and comparison reports</p>

    <ul class="reports-list">
      ${reports.map(report => `
        <li>
          <a href="${report.file}" class="report-item">
            <div>
              <div class="report-title">${report.file}</div>
              <div class="report-date">${report.date.toLocaleString()}</div>
            </div>
            <span class="report-type ${report.type.toLowerCase()}">${report.type}</span>
          </a>
        </li>
      `).join('')}
    </ul>

    <div class="footer">
      <p>Nexure.js Performance Benchmarks</p>
    </div>
  </body>
  </html>
  `;

  fs.writeFileSync(path.join(REPORTS_DIR, 'index.html'), html);
  console.log(`Generated index file: ${path.join(REPORTS_DIR, 'index.html')}`);
};

// Run the process
processResultFiles();
