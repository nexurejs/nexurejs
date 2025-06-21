# Adaptive Worker Pool

## Overview

The Adaptive Worker Pool is a self-tuning thread pool implementation designed for high-performance Node.js applications. It intelligently manages worker threads to optimize resource utilization and throughput based on workload patterns.

## Key Features

- **Adaptive Scaling**: Automatically adjusts the number of worker threads based on current and predicted workload
- **Predictive Scaling**: Anticipates future demand by analyzing historical usage patterns
- **Priority-based Task Scheduling**: Processes high-priority tasks first with intelligent worker assignment
- **Performance Metrics**: Detailed metrics for monitoring and fine-tuning
- **Resource Utilization Tracking**: Monitors CPU and memory usage per worker
- **Work Stealing**: Enables efficient load balancing between workers

## Implementation Details

### Adaptive Scaling Algorithms

The worker pool uses several sophisticated algorithms to determine when and how to scale:

1. **Smoothed Utilization Tracking**: Applies exponential smoothing to worker utilization metrics to prevent reactive scaling
   ```typescript
   smoothedUtilization = (α * instantUtilization) + ((1 - α) * previousUtilization)
   ```

2. **Predictive Workload Analysis**: Examines historical patterns to anticipate future demand
   - Time-of-day patterns
   - Day-of-week patterns
   - Recent trend analysis

3. **Multi-factor Scaling Decisions**: Uses a combination of:
   - Current worker utilization
   - Queue depth and wait times
   - Predicted future load
   - Task priority distribution

### Worker Utilization Metrics

The system collects detailed metrics for each worker:

- **CPU Usage**: Tracked per worker and aggregated for the pool
- **Memory Usage**: Monitored to prevent memory-related issues
- **Task Processing Time**: Measured for performance analysis
- **Idle Time**: Used for scale-down decisions
- **Worker Efficiency**: Tasks processed per CPU usage unit

### Priority-based Task Processing

Tasks can be assigned priorities which affect scheduling:

- High-priority tasks are moved to the front of the queue
- The system may preemptively scale up when high-priority tasks are queued
- Workers are assigned based on both availability and current load

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `minWorkers` | Minimum number of workers to maintain | `cpuCount / 2` |
| `maxWorkers` | Maximum number of workers to create | `cpuCount` |
| `predictiveScaling` | Enable/disable predictive scaling | `true` |
| `patternHistorySize` | Number of historical patterns to maintain | `20` |
| `utilizationSmoothingFactor` | Smoothing factor for utilization (0-1) | `0.3` |
| `scaleUpAggressiveness` | How aggressively to scale up (higher = more workers) | `1.5` |
| `scaleDownCaution` | How cautiously to scale down (higher = slower reduction) | `0.8` |
| `highPriorityQueueThreshold` | Priority level considered "high" for scaling | `10` |

## Usage Example

```typescript
import { AdaptiveWorkerPool } from '../concurrency/adaptive-worker-pool.js';

// Create the worker pool
const pool = new AdaptiveWorkerPool({
  workerScript: './worker.js',
  minWorkers: 2,
  maxWorkers: 8,
  predictiveScaling: true,
  scaleUpAggressiveness: 2.0,
  scaleDownCaution: 0.7
});

// Execute a task
const taskId = await pool.executeTask({
  type: 'processImage',
  data: { filePath: '/path/to/image.jpg', filters: ['blur', 'sharpen'] },
  priority: 5,
  cpuIntensity: 0.8
});

// Get pool status and metrics
const status = pool.getStatus();
console.log(`Workers: ${status.workers}, Busy: ${status.busy}, Queue: ${status.queueSize}`);
console.log(`Average execution time: ${status.stats.avgExecutionTime}ms`);
console.log(`CPU utilization: ${status.stats.cpuUtilization * 100}%`);
console.log(`Predicted load: ${status.stats.predictedLoad * 100}%`);
```

## Performance Characteristics

### Scaling Behavior

The worker pool scales based on the following rules:

1. **Scale Up Conditions**:
   - Worker utilization exceeds `scaleUpThreshold` (default: 70%)
   - Predicted load exceeds current capacity
   - High-priority tasks are queued with insufficient workers

2. **Scale Up Strategy**:
   - Adds workers proportionally to the utilization excess
   - Applies aggressiveness factor to scale faster when needed
   - Respects scaling cooldown to prevent oscillation

3. **Scale Down Conditions**:
   - Worker utilization below `scaleDownThreshold` (default: 30%)
   - Workers idle longer than `maxIdleTime`
   - Predicted load indicates reduced future demand

4. **Scale Down Strategy**:
   - Terminates idle workers cautiously
   - Prioritizes removing least-utilized workers
   - Maintains at least `minWorkers`

### Throughput Optimization

The worker pool achieves optimal throughput through:

- **Smart Worker Selection**: Assigns tasks to workers with lower CPU usage
- **Queue Management**: Prioritizes tasks based on assigned priority
- **Backpressure Handling**: Rejects new tasks when queue is full to prevent system overload
- **Timeout Management**: Handles stalled tasks to prevent worker lockup

## Monitoring

The worker pool provides detailed metrics through the `getStatus()` method:

```typescript
{
  workers: 4,               // Total number of workers
  busy: 3,                  // Currently busy workers
  idle: 1,                  // Idle workers
  queueSize: 5,             // Tasks waiting in queue
  stats: {
    tasksProcessed: 1250,
    tasksSucceeded: 1245,
    tasksFailed: 5,
    avgExecutionTime: 347,   // ms
    avgWaitTime: 42,         // ms
    throughput: 24.5,        // tasks/second
    predictedLoad: 0.85,     // 0-1 scale
    cpuUtilization: 0.72     // 0-1 scale
  },
  metrics: {
    workerUtilization: [...],        // Historical utilization
    queueWaitTimes: [...],           // Recent wait times
    responseLatencies: [...],        // Recent response times
    taskThroughputHistory: [...],    // Throughput over time
    cpuUtilizationHistory: [...]     // CPU usage over time
  }
}
```

## Best Practices

1. **Worker Script Design**:
   - Keep worker code lightweight and focused
   - Return resource usage metrics with task results
   - Handle cleanup properly to prevent memory leaks

2. **Task Definition**:
   - Specify priority for time-sensitive tasks
   - Set appropriate timeouts for tasks
   - Include `cpuIntensity` and `memoryRequirement` when known

3. **Pool Configuration**:
   - Adjust `minWorkers` and `maxWorkers` based on your hardware
   - Fine-tune scaling parameters based on workload characteristics
   - Increase `patternHistorySize` for more stable workloads

4. **Monitoring**:
   - Regularly check `getStatus()` metrics
   - Watch for high queue sizes or wait times
   - Adjust configuration if pool frequently hits `maxWorkers`

## Error Handling

The worker pool implements robust error handling:

- **Worker Crashes**: Automatically replaces crashed workers
- **Task Timeouts**: Terminates tasks that exceed their timeout
- **Queue Overflow**: Rejects tasks when queue is full with clear error messages
- **Shutdown Handling**: Gracefully terminates workers during shutdown

## Conclusion

The Adaptive Worker Pool provides a sophisticated solution for managing CPU-intensive tasks in Node.js applications. By intelligently scaling based on both current utilization and predicted demand, it optimizes resource usage while maintaining responsive performance under varying workloads.
