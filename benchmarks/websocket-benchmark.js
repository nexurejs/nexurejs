#!/usr/bin/env node

/**
 * WebSocket Performance Benchmark for NexureJS
 * Tests real-time messaging, connection handling, and throughput
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const CONFIG = {
  connections: 1000,
  messagesPerConnection: 100,
  testDuration: 30000, // 30 seconds
  batchSize: 50,
  messageSize: {
    small: 100,    // 100 bytes
    medium: 1024,  // 1KB
    large: 10240   // 10KB
  },
  scenarios: ['chat', 'trading', 'gaming', 'notifications']
};

// Results storage
const results = {
  scenarios: {},
  summary: {},
  metadata: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    config: CONFIG
  }
};

/**
 * Utility Functions
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateMessage(scenario, size = 'medium') {
  const messageSize = CONFIG.messageSize[size];
  const baseMessage = {
    timestamp: Date.now(),
    id: Math.random().toString(36).substr(2, 9)
  };

  switch (scenario) {
    case 'chat':
      return {
        ...baseMessage,
        type: 'message',
        user: `user_${Math.floor(Math.random() * 1000)}`,
        channel: `channel_${Math.floor(Math.random() * 10)}`,
        message: 'x'.repeat(Math.max(50, messageSize - 150))
      };

    case 'trading':
      return {
        ...baseMessage,
        type: 'price_update',
        symbol: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'][Math.floor(Math.random() * 4)],
        price: (Math.random() * 1000).toFixed(2),
        volume: Math.floor(Math.random() * 100000),
        data: 'x'.repeat(Math.max(50, messageSize - 200))
      };

    case 'gaming':
      return {
        ...baseMessage,
        type: 'player_update',
        playerId: `player_${Math.floor(Math.random() * 100)}`,
        position: { x: Math.random() * 1000, y: Math.random() * 1000 },
        health: Math.floor(Math.random() * 100),
        gameData: 'x'.repeat(Math.max(50, messageSize - 250))
      };

    case 'notifications':
      return {
        ...baseMessage,
        type: 'notification',
        userId: `user_${Math.floor(Math.random() * 10000)}`,
        title: 'Test Notification',
        body: 'x'.repeat(Math.max(50, messageSize - 180))
      };

    default:
      return {
        ...baseMessage,
        data: 'x'.repeat(Math.max(50, messageSize - 100))
      };
  }
}

/**
 * WebSocket Client
 */
class WebSocketClient {
  constructor(url, scenario) {
    this.url = url;
    this.scenario = scenario;
    this.ws = null;
    this.connected = false;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.totalLatency = 0;
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const WebSocket = require('ws');
        this.ws = new WebSocket(this.url);
        this.startTime = performance.now();

        this.ws.on('open', () => {
          this.connected = true;
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            this.messagesReceived++;

            if (message.timestamp) {
              const latency = Date.now() - message.timestamp;
              this.totalLatency += latency;
            }
          } catch (error) {
            this.errors.push(`Parse error: ${error.message}`);
          }
        });

        this.ws.on('error', (error) => {
          this.errors.push(error.message);
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.endTime = performance.now();
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  async sendMessage(message) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            this.errors.push(error.message);
            reject(error);
          } else {
            this.messagesSent++;
            resolve();
          }
        });
      } catch (error) {
        this.errors.push(error.message);
        reject(error);
      }
    });
  }

  close() {
    if (this.ws && this.connected) {
      this.ws.close();
    }
  }

  getStats() {
    const duration = this.endTime ? this.endTime - this.startTime : performance.now() - this.startTime;
    return {
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      avgLatency: this.messagesReceived > 0 ? this.totalLatency / this.messagesReceived : 0,
      duration,
      throughput: duration > 0 ? (this.messagesSent + this.messagesReceived) / (duration / 1000) : 0,
      errors: this.errors.length,
      errorMessages: this.errors
    };
  }
}

/**
 * Create WebSocket test server
 */
async function createWebSocketServer(port, scenario) {
  const serverCode = `
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let connections = new Set();
let messageCount = 0;
let broadcastInterval;

wss.on('connection', (ws) => {
  connections.add(ws);
  console.log(\`New connection. Total: \${connections.size}\`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      messageCount++;

      // Echo the message back with server timestamp
      const response = {
        ...message,
        serverTimestamp: Date.now(),
        processed: true
      };

      ws.send(JSON.stringify(response));

      // For certain scenarios, broadcast to other clients
      if (['${scenario}'].includes('chat') || ['${scenario}'].includes('gaming')) {
        connections.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              ...response,
              broadcast: true
            }));
          }
        });
      }

    } catch (error) {
      ws.send(JSON.stringify({ error: error.message }));
    }
  });

  ws.on('close', () => {
    connections.delete(ws);
    console.log(\`Connection closed. Total: \${connections.size}\`);
  });

  ws.on('error', (error) => {
    console.log('WebSocket error:', error.message);
    connections.delete(ws);
  });
});

// For trading scenario, send periodic price updates
if ('${scenario}' === 'trading') {
  broadcastInterval = setInterval(() => {
    const priceUpdate = {
      type: 'price_update',
      symbol: 'TEST',
      price: (Math.random() * 1000).toFixed(2),
      timestamp: Date.now()
    };

    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(priceUpdate));
      }
    });
  }, 1000);
}

server.listen(${port}, () => {
  console.log(\`WebSocket server running on port ${port}\`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  if (broadcastInterval) clearInterval(broadcastInterval);
  connections.forEach(ws => ws.close());
  server.close(() => {
    console.log('WebSocket server stopped');
    process.exit(0);
  });
});

// Stats endpoint
server.on('request', (req, res) => {
  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connections: connections.size,
      messages: messageCount,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
`;

  const serverPath = path.join(__dirname, `websocket-server-${scenario}-${port}.js`);
  await fs.writeFile(serverPath, serverCode);

  const process = spawn('node', [serverPath], {
    stdio: 'pipe',
    detached: false
  });

  return { process, path: serverPath };
}

/**
 * Run WebSocket benchmark for a specific scenario
 */
async function runWebSocketBenchmark(scenario) {
  log(`Starting WebSocket benchmark for ${scenario} scenario`);

  const port = 3000 + Math.floor(Math.random() * 1000);
  const wsUrl = `ws://localhost:${port}`;

  let server = null;
  let serverPath = null;

  try {
    // Start server
    const serverInfo = await createWebSocketServer(port, scenario);
    server = serverInfo.process;
    serverPath = serverInfo.path;

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    log(`Server started on port ${port}, creating ${CONFIG.connections} connections...`);

    // Create clients
    const clients = [];
    const connectionPromises = [];

    // Create connections in batches to avoid overwhelming
    for (let batch = 0; batch < Math.ceil(CONFIG.connections / CONFIG.batchSize); batch++) {
      const batchStart = batch * CONFIG.batchSize;
      const batchEnd = Math.min(batchStart + CONFIG.batchSize, CONFIG.connections);

      for (let i = batchStart; i < batchEnd; i++) {
        const client = new WebSocketClient(wsUrl, scenario);
        clients.push(client);
        connectionPromises.push(client.connect().catch(error => {
          log(`Connection ${i} failed: ${error.message}`);
          return null;
        }));
      }

      // Wait between batches
      if (batch < Math.ceil(CONFIG.connections / CONFIG.batchSize) - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Wait for all connections
    await Promise.all(connectionPromises);

    const connectedClients = clients.filter(client => client.connected);
    log(`${connectedClients.length}/${CONFIG.connections} clients connected successfully`);

    if (connectedClients.length === 0) {
      throw new Error('No clients connected successfully');
    }

    // Run message test
    log(`Starting message test - ${CONFIG.messagesPerConnection} messages per client...`);

    const messagePromises = [];
    const startTime = performance.now();

    for (const client of connectedClients) {
      const clientPromise = async () => {
        try {
          for (let i = 0; i < CONFIG.messagesPerConnection; i++) {
            const message = generateMessage(scenario, 'medium');
            await client.sendMessage(message);

            // Small delay to prevent overwhelming
            if (i % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        } catch (error) {
          log(`Client message error: ${error.message}`);
        }
      };

      messagePromises.push(clientPromise());
    }

    // Wait for all messages or timeout
    await Promise.race([
      Promise.all(messagePromises),
      new Promise(resolve => setTimeout(resolve, CONFIG.testDuration))
    ]);

    const endTime = performance.now();
    const testDuration = endTime - startTime;

    // Wait a bit for responses
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Collect statistics
    const stats = {
      scenario,
      connections: connectedClients.length,
      testDuration,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      totalLatency: 0,
      totalErrors: 0,
      clientStats: []
    };

    for (const client of connectedClients) {
      const clientStats = client.getStats();
      stats.totalMessagesSent += clientStats.messagesSent;
      stats.totalMessagesReceived += clientStats.messagesReceived;
      stats.totalLatency += clientStats.avgLatency * clientStats.messagesReceived;
      stats.totalErrors += clientStats.errors;
      stats.clientStats.push(clientStats);

      client.close();
    }

    // Calculate final metrics
    stats.avgLatency = stats.totalMessagesReceived > 0 ?
      stats.totalLatency / stats.totalMessagesReceived : 0;
    stats.throughput = (stats.totalMessagesSent + stats.totalMessagesReceived) / (testDuration / 1000);
    stats.messagesPerSecond = stats.totalMessagesSent / (testDuration / 1000);
    stats.successRate = stats.totalErrors === 0 ? 100 :
      ((stats.totalMessagesSent - stats.totalErrors) / stats.totalMessagesSent) * 100;

    log(`${scenario} completed:`);
    log(`  Connections: ${stats.connections}`);
    log(`  Messages sent: ${stats.totalMessagesSent}`);
    log(`  Messages received: ${stats.totalMessagesReceived}`);
    log(`  Throughput: ${stats.throughput.toFixed(2)} msg/s`);
    log(`  Average latency: ${stats.avgLatency.toFixed(2)}ms`);
    log(`  Success rate: ${stats.successRate.toFixed(2)}%`);

    return stats;

  } catch (error) {
    log(`WebSocket benchmark failed for ${scenario}: ${error.message}`);
    return { scenario, error: error.message };

  } finally {
    // Cleanup
    if (server) {
      server.kill('SIGTERM');
    }

    if (serverPath) {
      try {
        await fs.unlink(serverPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Main benchmark execution
 */
async function runWebSocketBenchmarks() {
  log('🚀 Starting WebSocket Benchmarks');
  log(`Configuration: ${JSON.stringify(CONFIG, null, 2)}`);

  try {
    // Test all scenarios
    for (const scenario of CONFIG.scenarios) {
      const result = await runWebSocketBenchmark(scenario);
      results.scenarios[scenario] = result;

      // Delay between scenarios
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Generate summary
    generateSummary();

    // Save results
    const resultsFile = await saveResults();

    // Display results
    displayResults();

    log(`\nDetailed results saved to: ${resultsFile}`);
    log('✅ WebSocket benchmarks completed successfully!');

  } catch (error) {
    log(`❌ WebSocket benchmarks failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Generate summary statistics
 */
function generateSummary() {
  const scenarios = Object.values(results.scenarios).filter(s => !s.error);

  if (scenarios.length === 0) {
    results.summary = { error: 'No successful scenarios' };
    return;
  }

  results.summary = {
    totalScenarios: CONFIG.scenarios.length,
    successfulScenarios: scenarios.length,
    avgConnections: scenarios.reduce((sum, s) => sum + s.connections, 0) / scenarios.length,
    totalMessages: scenarios.reduce((sum, s) => sum + s.totalMessagesSent, 0),
    avgThroughput: scenarios.reduce((sum, s) => sum + s.throughput, 0) / scenarios.length,
    avgLatency: scenarios.reduce((sum, s) => sum + s.avgLatency, 0) / scenarios.length,
    bestScenario: scenarios.reduce((best, current) =>
      current.throughput > best.throughput ? current : best
    ),
    worstScenario: scenarios.reduce((worst, current) =>
      current.avgLatency > worst.avgLatency ? current : worst
    )
  };
}

/**
 * Display results
 */
function displayResults() {
  console.log('\n' + '='.repeat(60));
  console.log('🔌 WEBSOCKET BENCHMARK RESULTS');
  console.log('='.repeat(60));

  console.log('\n📊 SCENARIO PERFORMANCE:');
  console.log('Scenario'.padEnd(20) + 'Connections'.padStart(12) + 'Throughput'.padStart(15) + 'Latency'.padStart(12));
  console.log('-'.repeat(60));

  for (const [scenario, result] of Object.entries(results.scenarios)) {
    if (!result.error) {
      const line = scenario.padEnd(20) +
                  result.connections.toString().padStart(12) +
                  `${result.throughput.toFixed(0)} msg/s`.padStart(15) +
                  `${result.avgLatency.toFixed(1)}ms`.padStart(12);
      console.log(line);
    } else {
      console.log(scenario.padEnd(20) + 'ERROR'.padStart(39));
    }
  }

  if (results.summary.bestScenario) {
    console.log(`\n🏆 Best Performance: ${results.summary.bestScenario.scenario}`);
    console.log(`    Throughput: ${results.summary.bestScenario.throughput.toFixed(2)} msg/s`);
    console.log(`    Latency: ${results.summary.bestScenario.avgLatency.toFixed(2)}ms`);
  }
}

/**
 * Save results to file
 */
async function saveResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `websocket-benchmark-${timestamp}.json`;
  const resultsDir = path.join(__dirname, 'results');
  const filepath = path.join(resultsDir, filename);

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(results, null, 2));

  return filepath;
}

// Run if this file is executed directly
if (require.main === module) {
  runWebSocketBenchmarks().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runWebSocketBenchmarks, CONFIG };
