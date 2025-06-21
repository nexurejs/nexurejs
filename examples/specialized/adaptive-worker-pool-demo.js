/**
 * Adaptive Worker Pool Demo
 *
 * This example demonstrates the enhanced adaptive worker pool's capabilities:
 * - Predictive scaling based on workload patterns
 * - Worker utilization metrics
 * - Performance monitoring
 * - Priority-based task scheduling
 */

import { AdaptiveWorkerPool } from '../src/concurrency/adaptive-worker-pool.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

// Get current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Create a worker pool with enhanced options
const pool = new AdaptiveWorkerPool({
  workerScript: join(__dirname, 'worker-task.js'),
  minWorkers: 2,
  maxWorkers: cpus().length,
  startWorkers: true,

  // Enhanced scaling options
  predictiveScaling: true,
  patternHistorySize: 20,
  utilizationSmoothingFactor: 0.3,
  scaleUpAggressiveness: 1.5,
  scaleDownCaution: 0.8
});

// Simulation variables
const taskTypes = ['light', 'medium', 'heavy', 'priority'];
const simulationTime = 60000; // 1 minute
const statusInterval = 2000;  // 2 seconds
let running = true;
let tasksSubmitted = 0;
let tasksCompleted = 0;
let startTime = Date.now();

// Register event handlers
pool.on('task:completed', (result) => {
  tasksCompleted++;

  // Log completion details for priority tasks
  if (result.metrics.wasStolen) {
    console.log(`🔄 Task ${result.taskId} was stolen and completed in ${result.metrics.executionTime.toFixed(2)}ms`);
  } else if (result.taskId.includes('priority')) {
    console.log(`⚡ Priority task ${result.taskId} completed in ${result.metrics.executionTime.toFixed(2)}ms`);
  }
});

pool.on('task:failed', (taskId, error) => {
  console.error(`❌ Task ${taskId} failed:`, error);
});

pool.on('pool:scaled-up', (newSize, reason) => {
  console.log(`⬆️ Pool scaled up to ${newSize} workers: ${reason}`);
});

pool.on('pool:scaled-down', (newSize, reason) => {
  console.log(`⬇️ Pool scaled down to ${newSize} workers: ${reason}`);
});

// Task generator functions
function createTask(type, priority = 0) {
  const taskId = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let complexity = 0;
  let duration = 0;

  switch(type) {
    case 'light':
      complexity = 10000; // Simple calculation
      duration = 100;     // ~100ms
      break;
    case 'medium':
      complexity = 100000; // Medium calculation
      duration = 500;      // ~500ms
      break;
    case 'heavy':
      complexity = 500000; // Heavy calculation
      duration = 2000;     // ~2000ms
      break;
    case 'priority':
      complexity = 200000; // Medium-heavy calculation
      duration = 800;      // ~800ms
      priority = 10;       // High priority
      break;
  }

  return {
    id: taskId,
    type,
    data: {
      iterations: complexity,
      cpuIntensive: type !== 'light',
      duration
    },
    priority,
    cpuIntensity: type === 'heavy' ? 0.9 : (type === 'medium' ? 0.6 : 0.3),
    timeout: duration * 3 // 3x expected duration
  };
}

// Simulate realistic workload patterns
async function simulateWorkload() {
  // Baseline regular tasks
  setInterval(() => {
    if (!running) return;

    // Submit a light task every 200ms
    const task = createTask('light');
    pool.executeTask(task);
    tasksSubmitted++;
  }, 200);

  // Medium tasks with moderate frequency
  setInterval(() => {
    if (!running) return;

    // Submit a medium task every 500ms
    const task = createTask('medium');
    pool.executeTask(task);
    tasksSubmitted++;
  }, 500);

  // Heavy tasks with low frequency
  setInterval(() => {
    if (!running) return;

    // Submit a heavy task every 2s
    const task = createTask('heavy');
    pool.executeTask(task);
    tasksSubmitted++;
  }, 2000);

  // Priority tasks occasionally (to demonstrate priority handling)
  setInterval(() => {
    if (!running) return;

    // Submit a priority task every 5s
    const task = createTask('priority', 10);
    console.log(`📌 Submitting priority task ${task.id}`);
    pool.executeTask(task);
    tasksSubmitted++;
  }, 5000);

  // Simulate a burst of tasks every 15 seconds (to demonstrate adaptive scaling)
  setInterval(() => {
    if (!running) return;

    console.log('🔥 Burst of tasks incoming...');

    // Submit 10 tasks in rapid succession
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        if (!running) return;

        const type = taskTypes[Math.floor(Math.random() * (taskTypes.length - 1))]; // Exclude priority from random selection
        const task = createTask(type);
        pool.executeTask(task);
        tasksSubmitted++;
      }, i * 100); // 100ms apart
    }
  }, 15000);
}

// Print status at intervals
function monitorStatus() {
  const statusTimer = setInterval(() => {
    if (!running) {
      clearInterval(statusTimer);
      return;
    }

    const status = pool.getStatus();
    const elapsedSec = (Date.now() - startTime) / 1000;
    const throughput = tasksCompleted / elapsedSec;

    console.log('\n📊 Worker Pool Status:');
    console.log(`Workers: Total=${status.workers}, Busy=${status.busy}, Idle=${status.idle}`);
    console.log(`Queue: ${status.queueSize} pending tasks`);
    console.log(`Tasks: ${tasksSubmitted} submitted, ${tasksCompleted} completed`);
    console.log(`Throughput: ${throughput.toFixed(2)} tasks/second`);
    console.log(`CPU Utilization: ${(status.stats.cpuUtilization * 100).toFixed(1)}%`);
    console.log(`Predicted Load: ${(status.stats.predictedLoad * 100).toFixed(1)}%`);
    console.log(`Avg Execution Time: ${status.stats.avgExecutionTime.toFixed(2)}ms`);
    console.log(`Avg Wait Time: ${status.stats.avgWaitTime.toFixed(2)}ms`);

    // Print a visual representation of worker utilization
    let utilizationGraph = '|';
    for (let i = 0; i < 20; i++) {
      utilizationGraph += i < Math.floor(status.stats.cpuUtilization * 20) ? '█' : ' ';
    }
    utilizationGraph += '| ';
    console.log(`Utilization: ${utilizationGraph}\n`);

  }, statusInterval);
}

// Run simulation for the specified duration
async function runSimulation() {
  console.log('🚀 Starting adaptive worker pool simulation...');
  console.log(`CPU Cores: ${cpus().length}`);
  console.log(`Worker Pool: min=${pool.options.minWorkers}, max=${pool.options.maxWorkers}`);
  console.log('Running simulation for', simulationTime / 1000, 'seconds\n');

  // Start workload generation
  simulateWorkload();

  // Monitor status
  monitorStatus();

  // Run for specified duration then stop
  setTimeout(async () => {
    running = false;
    console.log('\n⏱️ Simulation complete');

    // Get final stats
    const finalStatus = pool.getStatus();
    console.log('\n📈 Final Statistics:');
    console.log(`Total Tasks Processed: ${finalStatus.stats.tasksProcessed}`);
    console.log(`Success Rate: ${((finalStatus.stats.tasksSucceeded / finalStatus.stats.tasksProcessed) * 100).toFixed(1)}%`);
    console.log(`Average Execution Time: ${finalStatus.stats.avgExecutionTime.toFixed(2)}ms`);
    console.log(`Peak Workers Used: ${finalStatus.workers}`);

    // Shut down the pool
    console.log('\n👋 Shutting down worker pool...');
    await pool.shutdown();
    console.log('Worker pool shutdown complete');
  }, simulationTime);
}

// Run the simulation
runSimulation().catch(err => {
  console.error('Simulation error:', err);
  process.exit(1);
});
